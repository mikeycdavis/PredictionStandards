#!/usr/bin/env node
/**
 * `predictions` — the command line for the prediction standards.
 *
 * FIVE COMMANDS, CHOSEN FOR THE DOMAIN WORKFLOWS RATHER THAN COPIED FROM A LIST. The
 * standards-system specification offers `init plan check audit explain status` as candidates and
 * says not to adopt them blindly. What a prediction workflow actually needs:
 *
 *   init     scaffold a policy and a template record into a project
 *   audit    what does this record contain, and where does it depart from the standards?
 *            Evidence only. No policy, no verdict.
 *   check    is this prediction sufficiently supported? Policy-aware, produces the verdict.
 *   explain  why did each rule apply or not apply, and what evidence was found?
 *   status   the posture of a whole directory of records, with framework coverage beside it.
 *
 * `plan` was dropped: there is no multi-step mutation to preview here, and the one command that
 * mutates (`init`) has its own --dry-run derived from the same plan object it applies.
 *
 * AUDIT AND CHECK ARE SEPARATE COMMANDS WITH DIFFERENT EXIT CONTRACTS, and no flag moves one into
 * the other. Evidence discovery and verdict are different jobs; a consumer that has to guess which
 * one it got is a consumer that will guess wrong.
 *
 * Exit codes:
 *   0  the command completed; for `check`, the record is supported
 *   1  the command completed; for `check`, the record is not supported or is blocked
 *   2  the command could not reach a conclusion: bad invocation, unreadable record, invalid policy
 *
 * The 1/2 split matters to CI. 1 means this tool worked and the prediction has problems; 2 means it
 * could not reach a verdict at all. Collapsing them tells CI that a broken evaluator is a failing
 * prediction, and the usual response to that is to weaken the check.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { loadCatalog, assertBindings, coverage, CatalogError } from "./catalog.mjs";
import { evaluate, envelope, STATUS } from "./compliance.mjs";
import { checkPolicy } from "./policy.mjs";
import {
  EVALUATED_RULES,
  inspect,
  inspectSchema,
  inspectSeries,
  loadRecords,
  recordApplicability,
  recordNotEvaluated,
  resolveParameters,
} from "./records.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_SCHEMA = path.join(ROOT, "schemas/prediction-record.schema.json");
const POLICY_SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const TOTAL_STANDARDS = 19;

function usage() {
  return `Usage: predictions <init|audit|check|explain|status> [record.json|directory] [flags]

  init      Scaffold a project policy and a template record. Creates missing files,
            never overwrites without an explicit per-path opt-in.
  audit     Evidence discovery. What a record contains and where it departs from the
            standards. Needs no policy; never produces a verdict.
  check     Policy-aware evaluation. Produces the authoritative verdict for a record
            or a directory of records.
  explain   Why each rule applied or did not, what evidence was found, and what is
            missing. Never changes a verdict.
  status    Aggregate posture of a directory, with framework coverage beside it.

  --policy=<path>   Use this policy instead of searching for one.
  --as-of=<ISO>     Evaluate staleness and expiry against this instant (default: now).
                    Pin it to make a run reproducible.
  --json            Emit the structured report on stdout instead of the readable one.
  --strict          audit only: exit 1 when any finding needs attention.
  --dry-run         init only: report what would happen, write nothing.
  --force-overwrite=<path>
                    init only: approve replacing one existing file.

Gate CI on \`check\`. Use \`audit\` for discovery and \`explain\` when a verdict needs
justifying. A verdict of BLOCKED_BY_INVARIANT means stop, not try harder.`;
}

function parseArgs(argv) {
  const options = {
    command: null,
    target: null,
    policy: null,
    asOf: null,
    json: false,
    strict: false,
    dryRun: false,
    forceOverwrite: [],
  };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--policy=")) options.policy = arg.slice("--policy=".length);
    else if (arg.startsWith("--as-of=")) options.asOf = arg.slice("--as-of=".length);
    else if (arg.startsWith("--force-overwrite=")) options.forceOverwrite.push(arg.slice("--force-overwrite=".length));
    else if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    else if (options.command === null) options.command = arg;
    else if (options.target === null) options.target = arg;
    else throw new Error(`unexpected argument '${arg}'`);
  }
  if (!options.command) throw new Error("a command is required");
  if (!["init", "audit", "check", "explain", "status"].includes(options.command)) {
    throw new Error(`unknown command '${options.command}'`);
  }
  if (options.strict && options.command !== "audit") {
    // --strict changes an exit contract, and only audit's is hers to change. Allowing it on check
    // would make the verdict's meaning depend on a flag.
    throw new Error("--strict applies to audit only");
  }
  if (options.asOf !== null && !Number.isFinite(Date.parse(options.asOf))) {
    throw new Error(`--as-of='${options.asOf}' is not a parseable instant`);
  }
  return options;
}

/** Find the policy: an explicit flag, then upward from the record, then this repository's own. */
function resolvePolicyPath(options) {
  if (options.policy) return options.policy;
  let dir = path.resolve(options.target ?? ".");
  if (existsSync(dir) && !dir.endsWith(".json")) {
    // walk from the directory itself
  } else {
    dir = path.dirname(dir);
  }
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "project-policy.yml");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const own = path.join(ROOT, "project-policy.yml");
  return existsSync(own) ? own : null;
}

const relative = (p) => path.relative(ROOT, p).split(path.sep).join("/") || p;

/**
 * Evaluate every record under `target`. Returns the per-record envelopes plus an aggregate.
 * `policy` may be null, in which case every record is NOT_EVALUATED — a missing policy is a
 * configuration fault, never a failing prediction.
 */
async function evaluateAll({ catalog, schema, policy, target, asOf, includeSeries = true }) {
  const loaded = await loadRecords(target);
  if (loaded.length === 0) throw new Error(`no records found at ${target}`);

  const parameters = resolveParameters(policy);
  const seriesFindings = includeSeries
    ? inspectSeries(loaded.filter((entry) => entry.record !== null))
    : new Map();
  const schemaFindings = inspectSchema(schema);

  const reports = [];
  for (const entry of loaded) {
    if (entry.record === null) {
      reports.push({ file: entry.file, parseError: entry.parseError, envelope: null });
      continue;
    }
    const findings = [
      ...inspect({ record: entry.record, schema, parameters, asOf }),
      ...(seriesFindings.get(entry.file) ?? []),
      ...schemaFindings,
    ];
    assertBindings(catalog, findings.map((f) => f.rule));

    const verdict = evaluate({
      catalog,
      policy,
      findings,
      evaluated: EVALUATED_RULES,
      today: asOf.slice(0, 10),
      recordApplicability: recordApplicability(entry.record),
      recordNotEvaluated: recordNotEvaluated(entry.record),
    });

    reports.push({
      file: entry.file,
      envelope: envelope({
        verdict,
        project: policy?.project ?? null,
        standardVersion: policy?.standardVersion ?? null,
        evaluatedAt: asOf,
        asOf,
        record: entry.record.id ?? null,
        parameters,
        frameworkCoverage: coverage(catalog, { evaluated: EVALUATED_RULES, totalStandards: TOTAL_STANDARDS }),
      }),
    });
  }

  const aggregate = {
    supported: 0,
    supportedWithExceptions: 0,
    insufficientlySupported: 0,
    blockedByInvariant: 0,
    notEvaluated: 0,
  };
  const key = {
    [STATUS.SUPPORTED]: "supported",
    [STATUS.SUPPORTED_WITH_EXCEPTIONS]: "supportedWithExceptions",
    [STATUS.INSUFFICIENTLY_SUPPORTED]: "insufficientlySupported",
    [STATUS.BLOCKED_BY_INVARIANT]: "blockedByInvariant",
    [STATUS.NOT_EVALUATED]: "notEvaluated",
  };
  for (const report of reports) {
    if (!report.envelope) aggregate.notEvaluated++;
    else aggregate[key[report.envelope.status]]++;
  }

  return { reports, aggregate, parameters };
}

/** Load the policy, or return the reason it could not be loaded. Never a verdict. */
async function loadPolicy(policyPath, asOf) {
  if (!policyPath) return { policy: null, error: "no project-policy.yml was found" };
  const result = await checkPolicy(policyPath, POLICY_SCHEMA, asOf.slice(0, 10));
  if (result.status === "invalid") {
    return {
      policy: null,
      error: `${relative(policyPath)} is not valid: ${result.errors.map((e) => `${e.path || "(document)"} ${e.message}`).join("; ")}`,
    };
  }
  // A policy with compliance findings still loads. Those findings are real — an expired exception,
  // an exception against a non-exemptible rule — and the compliance engine reports them against the
  // rules they target rather than refusing to run.
  return { policy: result.document, policyFindings: result.findings };
}

const STATUS_NOTE = {
  [STATUS.SUPPORTED]: "Every applicable rule that was evaluated passed. Rules nothing evaluated are listed as not-evaluated, not as passes.",
  [STATUS.SUPPORTED_WITH_EXCEPTIONS]: "Supported only by way of one or more approved exceptions. Each is listed above with its approver and expiry.",
  [STATUS.INSUFFICIENTLY_SUPPORTED]: "At least one applicable rule failed. The prediction is not justified by the evidence it carries.",
  [STATUS.BLOCKED_BY_INVARIANT]: "A non-exemptible rule failed, or the standards system was manipulated to avoid one. This means stop, not try harder. Do not adjust the policy, the thresholds, or the record's declarations to change this verdict.",
  [STATUS.NOT_EVALUATED]: "No verdict was reached. This is a configuration fault, not a statement about the prediction.",
};

function renderReport(report, { verbose = false, verdict = true } = {}) {
  const out = [];
  if (!report.envelope) {
    out.push(`  ${relative(report.file)}`);
    out.push(
      verdict
        ? `    NOT_EVALUATED — the record could not be parsed: ${report.parseError}`
        : `    unreadable — ${report.parseError}`,
    );
    return out;
  }
  const e = report.envelope;
  // `audit` prints no status word and no score. It is evidence discovery, and showing a verdict
  // here would make the two commands interchangeable to anyone reading the output.
  const failed = e.results.filter((r) => r.status === "failed").length;
  out.push(
    verdict
      ? `  ${relative(report.file)}  ${e.status}${e.score === null ? "" : `  (${e.score}%)`}`
      : `  ${relative(report.file)}  ${failed} finding(s)`,
  );

  const failures = e.results.filter((r) => r.status === "failed");
  for (const r of failures) {
    out.push(`    FAIL  ${r.ruleId}`);
    out.push(`          ${r.message}`);
    if (verbose) out.push(`          fix: ${r.remediation}`);
  }
  const warnings = e.results.filter((r) => r.status === "warning");
  for (const r of warnings) out.push(`    warn  ${r.ruleId}: ${r.message}`);

  if (verbose) {
    const notApplicable = e.results.filter((r) => r.disposition === "not-applicable");
    for (const r of notApplicable) out.push(`    n/a   ${r.ruleId}: ${r.message}`);
    const notEvaluated = e.results.filter((r) => r.disposition === "not-evaluated");
    for (const r of notEvaluated) out.push(`    ----  ${r.ruleId}: not evaluated`);
    const attested = e.results.filter((r) => r.disposition === "attested");
    for (const r of attested) out.push(`    att   ${r.ruleId}: ${r.message}`);
    const passed = e.results.filter((r) => r.status === "passed" && r.disposition === "evaluated");
    for (const r of passed) out.push(`    ok    ${r.ruleId}`);
  }
  return out;
}

function renderAssurance(e) {
  const a = e.assurance;
  const c = e.frameworkCoverage;
  return [
    `  Assurance:  ${a.automated} automated, ${a.manualReview} human-reviewed, ${a.notEvaluated} not evaluated`,
    `  Coverage:   ${c.evaluatedRules}/${c.cataloguedRules} rules have a detector; ${c.fullyMachineRepresentedStandards}/${c.standards} standards fully machine-represented`,
    "  Coverage is framework maturity, reported beside the verdict and never combined with it.",
    "  A verdict speaks only about the rules that were evaluated.",
  ];
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`predictions: ${error.message}\n\n${usage()}\n`);
    process.exit(EXIT_INVOCATION);
  }

  if (options.command === "init") {
    const { runInit } = await import("./init.mjs");
    return runInit(options);
  }

  const asOf = options.asOf ?? new Date().toISOString();
  const target = options.target ?? path.join(ROOT, "examples/records");

  let catalog;
  let schema;
  try {
    catalog = await loadCatalog();
    schema = JSON.parse(await readFile(RECORD_SCHEMA, "utf8"));
  } catch (error) {
    const detail = error instanceof CatalogError ? `catalog: ${error.message}` : error.message;
    process.stderr.write(`predictions: ${detail}\n`);
    process.exit(EXIT_INVOCATION);
  }

  const policyPath = resolvePolicyPath(options);
  const { policy, error: policyError } = await loadPolicy(policyPath, asOf);

  // `audit` produces no verdict, so it needs no policy — but it does need the project's thresholds,
  // because a disagreement threshold or a confidence vocabulary is an input to *observing* anything
  // at all. Without them it would report a record using the project vocabulary as having an
  // undefined confidence tier, which is a fact about the missing policy rather than about the
  // record. So audit reads `parameters` and nothing else: no applicability, no exceptions, no
  // attestations, and no verdict. A missing or invalid policy leaves it on documented defaults
  // rather than stopping it.
  const auditing = options.command === "audit";
  const effectivePolicy = auditing ? (policy ? { parameters: policy.parameters } : null) : policy;

  if (!auditing && policyError) {
    process.stderr.write(`predictions ${options.command}: ${policyError}\n`);
    process.stderr.write("A policy that cannot be read is a configuration fault, not a failing prediction.\n");
    process.exit(EXIT_INVOCATION);
  }

  let evaluation;
  try {
    evaluation = await evaluateAll({ catalog, schema, policy: effectivePolicy, target, asOf });
  } catch (error) {
    process.stderr.write(`predictions ${options.command}: ${error.message}\n`);
    process.exit(EXIT_INVOCATION);
  }

  const { reports, aggregate, parameters } = evaluation;

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          schemaVersion: "1.0",
          command: options.command,
          policy: policyPath ? relative(policyPath) : null,
          asOf,
          parameters,
          records: reports.map((r) => ({ file: relative(r.file), parseError: r.parseError ?? null, ...(r.envelope ?? {}) })),
          aggregate,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    const out = [];
    const heading = {
      audit: "Audit — evidence only, no verdict",
      check: "Check — is each prediction sufficiently supported?",
      explain: "Explain — why each rule applied, and what was found",
      status: "Status — aggregate posture",
    }[options.command];
    out.push(heading, "");
    out.push(`  Records:    ${reports.length} under ${relative(target)}`);
    if (auditing) {
      out.push(
        policy
          ? `  Thresholds: from ${relative(policyPath)} (audit reads parameters only, and reaches no verdict)`
          : "  Thresholds: evaluator defaults (no policy found; audit reaches no verdict regardless)",
      );
    } else if (policyPath) {
      out.push(`  Policy:     ${relative(policyPath)}`);
    }
    out.push(`  As of:      ${asOf}`);
    out.push("");

    if (options.command !== "status") {
      for (const report of reports) {
        out.push(...renderReport(report, { verbose: options.command === "explain", verdict: !auditing }));
        out.push("");
      }
    }

    if (options.command === "audit") {
      const total = reports.reduce(
        (n, r) => n + (r.envelope?.results.filter((x) => x.status === "failed").length ?? 0),
        0,
      );
      out.push(`  ${total} finding(s) across ${reports.length} record(s).`);
      out.push("  This is a survey, not a verdict. Run `check` for the authoritative result.");
    } else {
      out.push("  " + Object.entries(aggregate).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", "));
      const first = reports.find((r) => r.envelope)?.envelope;
      if (first) {
        out.push("");
        out.push(...renderAssurance(first));
      }
      const worst = reports.map((r) => r.envelope?.status).filter(Boolean);
      if (worst.includes(STATUS.BLOCKED_BY_INVARIANT)) {
        out.push("");
        out.push(`  ${STATUS_NOTE[STATUS.BLOCKED_BY_INVARIANT]}`);
      }
    }
    process.stdout.write(out.join("\n") + "\n");
  }

  if (options.command === "audit") {
    if (!options.strict) process.exit(EXIT_OK);
    const any = reports.some((r) => !r.envelope || r.envelope.results.some((x) => x.status === "failed"));
    process.exit(any ? EXIT_FINDINGS : EXIT_OK);
  }

  if (options.command === "explain" || options.command === "status") {
    // Neither produces a verdict, so neither fails on one. They exit 2 only on configuration
    // faults, which were handled above.
    process.exit(aggregate.notEvaluated > 0 ? EXIT_INVOCATION : EXIT_OK);
  }

  if (aggregate.notEvaluated > 0) process.exit(EXIT_INVOCATION);
  const bad = aggregate.insufficientlySupported + aggregate.blockedByInvariant;
  process.exit(bad > 0 ? EXIT_FINDINGS : EXIT_OK);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
