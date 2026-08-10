/**
 * The rule catalog: the single source of machine truth for rule identity and metadata.
 *
 * The architectural rule this module exists to hold, and which the whole compliance system rests on:
 *
 *   The catalog defines rule identity and metadata.
 *   project-policy.yml defines project applicability.
 *   The evaluator produces evidence.
 *   None of the three may redefine the others.
 *
 * So: a level or severity in the catalog is the framework's default and a policy may select a
 * different level for a project, but a policy may not invent a rule the catalog does not define, and
 * an evaluator may not report against an id the catalog does not carry. `assertBindings` enforces
 * the last of those mechanically, because a detector reporting an unknown rule id is exactly the
 * dual-vocabulary drift this repository's canonical-identity decision abolished.
 *
 * `appliesTo` is this pack's one addition to the inherited rule shape (ADR 0005). The subject here is
 * an individual prediction record, and some rules have no subject in an abstention record — an
 * abstention has no edge to recompute and no expiry to check. That is applicability determined by the
 * record itself rather than by policy, so it needs a home in rule identity: the catalog states which
 * kind of output a rule can speak about, and the evaluator emits `not-applicable` accordingly. It is
 * not a waiver, and it can never turn a failure into a pass.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = path.join(ROOT, "rules");

export const VALIDATION_TYPES = new Set([
  "structural",
  "document",
  "configuration",
  "code-analysis",
  "manual-review",
]);
export const ASSURANCE = new Set(["full", "partial", "none"]);
export const LEVELS = new Set(["required", "recommended", "optional", "forbidden"]);
export const SEVERITIES = new Set(["error", "warning", "info"]);
export const APPLIES_TO = new Set(["prediction", "abstention", "any"]);

const CANONICAL_ID = /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogError";
  }
}

/**
 * Load every rules/*.json file into one catalog.
 *
 * Returns { rules: Map<id, rule>, aliases: Map<alias, id>, byCategory: Map<category, rule[]> }.
 * Throws CatalogError on a malformed entry — a catalog that loads partially would silently shrink
 * the denominator every score is computed over.
 */
export async function loadCatalog(dir = CATALOG_DIR) {
  const rules = new Map();
  const aliases = new Map();

  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new CatalogError(`no rule files found in ${dir}`);

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch (error) {
      throw new CatalogError(`${file}: ${error.message}`);
    }
    if (!Array.isArray(parsed.rules)) throw new CatalogError(`${file}: missing a 'rules' array`);

    for (const rule of parsed.rules) {
      const where = `${file}:${rule.id ?? "(no id)"}`;
      if (typeof rule.id !== "string" || !CANONICAL_ID.test(rule.id)) {
        throw new CatalogError(`${where}: id is not a canonical category.kebab-case-name (ADR 0002)`);
      }
      if (rules.has(rule.id)) throw new CatalogError(`${where}: duplicate rule id`);

      for (const [field, allowed] of [
        ["level", LEVELS],
        ["severity", SEVERITIES],
        ["validationType", VALIDATION_TYPES],
        ["assurance", ASSURANCE],
      ]) {
        if (!allowed.has(rule[field])) {
          throw new CatalogError(`${where}: ${field} '${rule[field]}' is not one of ${[...allowed].join(", ")}`);
        }
      }
      for (const field of ["title", "description", "remediation", "introducedIn"]) {
        if (typeof rule[field] !== "string" || rule[field].trim() === "") {
          throw new CatalogError(`${where}: ${field} is required`);
        }
      }
      if (typeof rule.standard !== "number") throw new CatalogError(`${where}: standard must be a number`);
      if (typeof rule.nonExemptible !== "boolean") {
        throw new CatalogError(`${where}: nonExemptible must be a boolean`);
      }
      // Present from the first release even when empty: adding them later means every existing rule
      // silently lacks them, and consumers treat their absence as meaningful.
      for (const field of ["deprecatedIn", "supersededBy", "removedIn"]) {
        if (!(field in rule)) throw new CatalogError(`${where}: lifecycle field '${field}' must be present`);
      }
      if (!Array.isArray(rule.aliases)) throw new CatalogError(`${where}: aliases must be an array`);

      for (const alias of rule.aliases) {
        if (aliases.has(alias)) throw new CatalogError(`${where}: alias '${alias}' is already claimed`);
        if (rules.has(alias)) throw new CatalogError(`${where}: '${alias}' is both a rule id and an alias`);
        aliases.set(alias, rule.id);
      }
      if ("attestable" in rule && typeof rule.attestable !== "boolean") {
        throw new CatalogError(`${where}: attestable must be a boolean when present`);
      }
      // Added in 1.1.0 as a widening (ADR 0005). Defaults to manual-review because those are the
      // rules whose metadata already says a human is the evaluator; anything else must opt in
      // explicitly, so attestation cannot become a universal override.
      const attestable = rule.attestable ?? rule.validationType === "manual-review";
      // Defaults to "any": a rule that does not say which output kind it speaks about speaks about
      // both. Silence must mean the widest scope, never the narrowest — the opposite default would
      // let a missing field quietly exempt a rule from every record.
      if ("appliesTo" in rule && !APPLIES_TO.has(rule.appliesTo)) {
        throw new CatalogError(
          `${where}: appliesTo '${rule.appliesTo}' is not one of ${[...APPLIES_TO].join(", ")}`,
        );
      }
      const appliesTo = rule.appliesTo ?? "any";
      rules.set(rule.id, Object.freeze({ ...rule, attestable, appliesTo, source: file }));
    }
  }

  // A second pass: an alias must never collide with a rule id defined in a later file.
  for (const alias of aliases.keys()) {
    if (rules.has(alias)) throw new CatalogError(`'${alias}' is both a rule id and an alias`);
  }

  const byCategory = new Map();
  for (const rule of rules.values()) {
    if (!byCategory.has(rule.category)) byCategory.set(rule.category, []);
    byCategory.get(rule.category).push(rule);
  }

  return { rules, aliases, byCategory };
}

/** Resolve an id or a legacy alias to a canonical rule. Returns undefined if neither. */
export function resolve(catalog, id) {
  return catalog.rules.get(id) ?? catalog.rules.get(catalog.aliases.get(id));
}

/**
 * Assert every rule id an evaluator reports against exists in the catalog.
 *
 * This is the mechanical guard on the architectural rule. Without it an evaluator can grow its own
 * vocabulary one detector at a time, which is how the audit came to speak in finding categories
 * while the policy spoke in rule ids.
 */
export function assertBindings(catalog, ids) {
  const unknown = [...new Set(ids)].filter((id) => !catalog.rules.has(id));
  if (unknown.length > 0) {
    throw new CatalogError(
      `evaluator reports against rule id(s) the catalog does not define: ${unknown.join(", ")}`,
    );
  }
}

/**
 * Framework maturity metadata — NOT part of the compliance score, and deliberately separate from it.
 *
 * The hazard this exists to counter: someone reads `COMPLIANT` and forgets that the catalog covers a
 * subset of the framework. A verdict is a statement about the rules that exist as rules; this is a
 * statement about how much of the framework has been turned into rules at all. Mixing the two would
 * make a coverage improvement look like a compliance improvement — the same elevation
 * [Standard 18](../standards/18-standards-integrity.md) R4 forbids one level down, where a skipped
 * check must never read as a pass.
 *
 * `fullyMachineRepresented` is deliberately strict: a standard counts only when every one of its
 * catalogued rules is both evaluated by the validator AND carries assurance better than `none`.
 * A standard whose rules are all catalogued but all unevaluated is represented on paper, not in
 * practice, and a looser definition would let the number rise without the tooling improving.
 */
export function coverage(catalog, { evaluated = [], totalStandards = null } = {}) {
  const examined = new Set(evaluated);
  const byStandard = new Map();
  for (const rule of catalog.rules.values()) {
    if (!byStandard.has(rule.standard)) byStandard.set(rule.standard, []);
    byStandard.get(rule.standard).push(rule);
  }

  let fullyMachineRepresented = 0;
  for (const rules of byStandard.values()) {
    const complete = rules.every((r) => examined.has(r.id) && r.assurance !== "none");
    if (complete) fullyMachineRepresented++;
  }

  return {
    cataloguedRules: catalog.rules.size,
    evaluatedRules: [...catalog.rules.keys()].filter((id) => examined.has(id)).length,
    standards: totalStandards,
    standardsWithRules: byStandard.size,
    fullyMachineRepresentedStandards: fullyMachineRepresented,
    note: "Framework maturity, not compliance. A standard counts as fully machine-represented only when every rule it contributes is evaluated and carries assurance above none.",
  };
}
