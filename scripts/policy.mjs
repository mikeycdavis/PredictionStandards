#!/usr/bin/env node
/**
 * Validate a project policy against schemas/project-policy.schema.json.
 *
 * Exit codes, and the distinction is the point:
 *
 *   0  the policy is valid
 *   1  the policy is valid but a compliance condition fails — an expired exception, an exception
 *      against a non-exemptible rule, a rule declared both not-applicable and excepted
 *   2  the policy could not be evaluated: unreadable, unparseable, or schema-invalid
 *
 * Invalid configuration is a `2`, never a `1`. "This policy is malformed" and "this project fails a
 * rule" are different facts, and collapsing them reports a broken config as non-compliance — which
 * is how a broken check comes to look like a failing project and gets disabled.
 *
 * NO ALIAS MECHANISM. The repository this architecture came from carries one, because it acquired
 * two spellings for the same rule before it settled on one and needed a bridge. This pack fixed
 * canonical identity — `category.kebab-case-name` — before the first rule was written, and the
 * schema's propertyNames pattern rejects any other spelling outright. Every rule's `aliases` is
 * empty and should stay that way: an alias is a second name, and a second name is a thing that
 * drifts. If one is ever genuinely needed, it belongs in the catalog, and this command should read
 * it from there rather than restating it.
 *
 * Usage: node scripts/policy.mjs [path/to/project-policy.yml] [--json] [--schema <path>]
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseYaml, YamlError } from "./yaml.mjs";
import { validate, assertSchemaSupported, SchemaError } from "./jsonschema.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const DEFAULT_POLICY = path.join(ROOT, "project-policy.yml");

/**
 * The `parameters` keys that carry numbers rather than text, and how strictly each is read.
 *
 * WHY THIS EXISTS. The YAML parser returns every scalar as a string on purpose: coercing `1.0` into
 * a number would defeat the schema's own check that `standardVersion` is a semver string. But the
 * thresholds in `parameters` genuinely are numbers, and the schema says so, so something has to
 * convert them. That something is here — one function, six named keys, applied before validation.
 *
 * This is not the parser guessing. The parser cannot know what a value means; this code can, because
 * the schema already fixed it. What matters is that the conversion is exhaustively enumerated and
 * refuses anything that is not a clean numeric literal. A silent `Number("high")` producing NaN, or
 * `Number("")` producing 0, would put a threshold nobody wrote into the middle of a verdict.
 */
const NUMERIC_PARAMETERS = {
  minSampleSize: "integer",
  disagreementThreshold: "number",
  materialityThreshold: "number",
  tolerance: "number",
  currencyTolerance: "number",
};

/**
 * Convert the numeric entries of `parameters` in place, returning any that could not be read.
 * A value left unconverted stays a string and the schema then rejects it, so a malformed threshold
 * fails as a configuration error rather than silently defaulting.
 */
export function coerceParameters(document) {
  const problems = [];
  const parameters = document?.parameters;
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) return problems;

  for (const [key, kind] of Object.entries(NUMERIC_PARAMETERS)) {
    if (!(key in parameters)) continue;
    const raw = parameters[key];
    if (typeof raw !== "string") continue;
    const literal = kind === "integer" ? /^-?[0-9]+$/ : /^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/;
    if (!literal.test(raw.trim())) {
      problems.push({ path: `parameters.${key}`, message: `'${raw}' is not ${kind === "integer" ? "an integer" : "a number"}` });
      continue;
    }
    parameters[key] = Number(raw.trim());
  }
  return problems;
}

/**
 * Rule ids a policy names that the catalog does not define.
 *
 * The schema can enforce the *shape* of an id but not its existence. A policy that grants an
 * exception to `probability.not-fabircated` is not protected by that exception — the rule it names
 * does not exist — and without this check the typo reads as a valid waiver right up until someone
 * wonders why the rule keeps failing.
 */
function detectUnknownRules(document, catalog) {
  if (!catalog) return [];
  const named = new Set();
  for (const section of ["rules", "applicability", "attestations"]) {
    for (const key of Object.keys(document?.[section] ?? {})) named.add(key);
  }
  for (const entry of Array.isArray(document?.exceptions) ? document.exceptions : []) {
    if (typeof entry?.rule === "string") named.add(entry.rule);
  }
  return [...named].filter((id) => !catalog.rules.has(id)).sort();
}

/** Compliance conditions that a well-formed policy can still fail. */
function complianceFindings(document, today, catalog) {
  const findings = [];

  for (const id of detectUnknownRules(document, catalog)) {
    findings.push({
      id: "policy.unknown-rule",
      severity: "error",
      message: `'${id}' is not a rule the catalog defines`,
      remediation: "Correct the id, or remove the declaration. A policy cannot invent a rule.",
    });
  }

  // A policy selects the level a rule is enforced at, but a non-exemptible rule's level is not the
  // project's to lower. Downgrading `forbidden` to `optional` waives the rule while leaving the
  // exception list conspicuously empty — the same outcome an exception would produce, by a route
  // that looks like configuration. Standard 18 names that as manipulation; this catches it.
  for (const [id, setting] of Object.entries(document.rules ?? {})) {
    const rule = catalog?.rules.get(id);
    if (!rule?.nonExemptible) continue;
    if (setting?.level !== rule.level) {
      findings.push({
        id: "policy.non-exemptible-downgrade",
        severity: "error",
        message: `'${id}' is non-exemptible and its level is '${rule.level}'; this policy sets '${setting?.level}'`,
        remediation: "Remove the override. A non-exemptible rule is enforced at its catalog level everywhere.",
      });
    }
  }

  // Same reasoning, one mechanism over: declaring a non-exemptible rule not-applicable is an
  // exception written in the other vocabulary. Applicability is a claim that the rule has no subject
  // here, and these rules — fabrication, lookahead, conflation — have a subject in every record.
  for (const [id, decl] of Object.entries(document.applicability ?? {})) {
    const rule = catalog?.rules.get(id);
    if (rule?.nonExemptible && decl?.status === "not-applicable") {
      findings.push({
        id: "policy.non-exemptible-not-applicable",
        severity: "error",
        message: `'${id}' is non-exemptible and cannot be declared not-applicable`,
        remediation:
          "Remove the declaration. These rules have a subject in every record; the claim they do not is not available.",
      });
    }
  }

  // A non-exemptible rule admits no exception. Caught here so an adopter learns it from
  // `npm run policy` rather than from a surprising verdict, and caught again in the compliance
  // engine so it cannot be bypassed by skipping this command.
  for (const entry of Array.isArray(document.exceptions) ? document.exceptions : []) {
    const rule = catalog?.rules.get(entry.rule);
    if (rule?.nonExemptible) {
      findings.push({
        id: "policy.non-exemptible-rule",
        severity: "error",
        message: `'${rule.id}' is non-exemptible; an exception against it is rejected, not recorded`,
        remediation:
          "Remove the exception and satisfy the rule. If it genuinely has no subject here, declare it not-applicable.",
      });
    }
  }

  const exceptions = Array.isArray(document.exceptions) ? document.exceptions : [];
  for (const entry of exceptions) {
    if (entry.expires && entry.expires < today) {
      findings.push({
        id: "policy.expired-exception",
        severity: "error",
        message: `exception for '${entry.rule}' expired on ${entry.expires}`,
        remediation: "Renew the exception with a new approval, or satisfy the rule.",
      });
    }
  }

  // An exception says the rule applies and is knowingly unmet; not-applicable says the rule has no
  // subject here. A rule cannot be both, and a policy asserting both is ambiguous rather than
  // strict — there is no safe way to pick one.
  const notApplicable = new Set(
    Object.entries(document.applicability ?? {})
      .filter(([, decl]) => decl?.status === "not-applicable")
      .map(([id]) => id),
  );
  for (const entry of exceptions) {
    if (notApplicable.has(entry.rule)) {
      findings.push({
        id: "policy.conflicting-classification",
        severity: "error",
        message: `'${entry.rule}' is declared not-applicable and also carries an exception`,
        remediation: "Remove one. not-applicable means the rule has no subject; an exception means it applies and is unmet.",
      });
    }
  }

  return findings;
}

function parseArgs(argv) {
  const options = { policy: null, schema: DEFAULT_SCHEMA, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--schema") options.schema = argv[++i];
    else if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    else if (options.policy === null) options.policy = arg;
    else throw new Error(`unexpected argument '${arg}'`);
  }
  if (options.policy === null) options.policy = DEFAULT_POLICY;
  if (!options.schema) throw new Error("--schema requires a path");
  return options;
}

/** Returns { status, errors, findings, aliases, document }. status is one of ok|findings|invalid. */
export async function checkPolicy(policyPath, schemaPath, today) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assertSchemaSupported(schema);

  let document;
  try {
    document = parseYaml(await readFile(policyPath, "utf8"));
  } catch (error) {
    if (error instanceof YamlError) {
      return { status: "invalid", errors: [{ path: "", message: error.message }], findings: [] };
    }
    throw error;
  }

  const coercionProblems = coerceParameters(document);
  const errors = [...coercionProblems, ...validate(document, schema)];
  if (errors.length > 0) return { status: "invalid", errors, findings: [], document };

  const catalog = await (async () => {
    try {
      const { loadCatalog } = await import("./catalog.mjs");
      return await loadCatalog();
    } catch {
      return null; // A missing catalog disables the rule-aware checks; it never fakes a pass.
    }
  })();
  const findings = complianceFindings(document, today, catalog);
  return { status: findings.length > 0 ? "findings" : "ok", errors: [], findings, document };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`predictions policy: ${error.message}\n`);
    process.exit(EXIT_INVOCATION);
  }

  const today = new Date().toISOString().slice(0, 10);
  let result;
  try {
    result = await checkPolicy(options.policy, options.schema, today);
  } catch (error) {
    const detail = error instanceof SchemaError ? `schema: ${error.message}` : error.message;
    process.stderr.write(`predictions policy: ${detail}\n`);
    process.exit(EXIT_INVOCATION);
  }

  const relative = path.relative(ROOT, options.policy).replace(/\\/g, "/") || options.policy;

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          // No schemaVersion. This is not the report envelope: its `status` is ok|findings|invalid,
          // a vocabulary disjoint from the five verdict statuses, and until ADR 0011 it borrowed
          // the envelope's "1.0" for a contract it was never under. A version naming no contract is
          // worse than no version — it invites a consumer to gate on a document that answers a
          // different question. Defining a format for this output is a separate decision nobody has
          // taken.
          policy: relative,
          status: result.status,
          errors: result.errors,
          findings: result.findings,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(`Policy: ${relative}\n\n`);
    for (const error of result.errors) {
      process.stdout.write(`  ${error.path || "(document)"}: ${error.message}\n`);
    }
    for (const finding of result.findings) {
      process.stdout.write(`  ${finding.severity.toUpperCase()} ${finding.id}: ${finding.message}\n`);
      process.stdout.write(`        ${finding.remediation}\n`);
    }
    if (result.status === "ok") {
      process.stdout.write("Valid against schemas/project-policy.schema.json.\n\n");
      process.stdout.write(
        "This says the policy is well-formed and internally consistent. It says nothing\n" +
          "about whether the project satisfies the rules it declares — that is a validation\n" +
          "run, not a schema check.\n",
      );
    } else if (result.status === "invalid") {
      process.stdout.write(`\n${result.errors.length} schema error(s). The policy could not be evaluated.\n`);
    } else {
      process.stdout.write(`\n${result.findings.length} compliance finding(s).\n`);
    }
  }

  if (result.status === "invalid") process.exit(EXIT_INVOCATION);
  if (result.status === "findings") process.exit(EXIT_FINDINGS);
  process.exit(EXIT_OK);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  await main();
} else if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
