#!/usr/bin/env node
/**
 * The release register, and the resolution of a policy's declared `standardVersion` against it
 * (ADR 0012, ST-27).
 *
 * WHAT THIS ESTABLISHES. A declared version resolves only when three independent things hold:
 *
 *   E1  existence       the version names a release this pack actually made — a lookup in
 *                       `artifacts/release-register.json`, never arithmetic over version numbers.
 *   E2  compatibility   every rule id the register records for that release is still in the catalog
 *                       and its per-rule digest equals the digest of the catalog shipping now.
 *   E3  introduction    every rule in the WHOLE catalog was introduced at or before the declared
 *       bound           version, and the declared version does not exceed the pack's VERSION.
 *
 * D5: `VERSION` is not exempt. The register must record the current release like any other, so a
 * pack whose register omits it resolves nothing.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO.
 *   - It takes no records and no target. Resolution is a property of the policy and the pack, and
 *     must be answerable before a record is read and be the same answer for every target (A15).
 *   - It never regenerates the register from the working tree at run time. A register derived from
 *     the thing it checks cannot detect a change in it (ADR 0012, Limits).
 *   - It has no write mode. `print` prints a candidate entry for a human to review and commit; the
 *     same reasoning as Standard 18 and the integrity baseline's absent `--write` flag. This file
 *     imports no file-writing primitive, and a test holds it to that.
 *
 * THE DIGEST (ST-27 decision 3). Per rule, sha256 over canonical JSON (sorted keys, no whitespace)
 * of the EFFECTIVE post-default values of DIGEST_FIELDS. The loader's added `source`, and the
 * fields `rationale`, `standard`, `category` and `$assuranceNote`, are outside the set and do not
 * move the digest; that is a consequence of the decision, recorded here rather than discovered.
 * `aliases` is digested as a sorted set: reordering it changes no behaviour and must not be read
 * as a change to the rule.
 *
 * Usage:
 *   node scripts/release-register.mjs print --version=<x.y.z> [--rules-dir=<dir>]
 *
 * `print` writes one JSON register fragment to stdout and nothing anywhere else. Provenance is not
 * invented: a human adds it, with the commit range or tag the rules directory was taken from.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadCatalog } from "./catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the pack ships its register. Read from the pack root, never from the target. */
export const REGISTER_PATH = path.join(ROOT, "artifacts/release-register.json");

/** Names the way a digest was computed. A register recorded under another scheme cannot be compared. */
export const DIGEST_SCHEME = "prediction-standards/rule-digest/1: sha256, canonical JSON, sorted keys, effective values";

/** The resolution document's own version. Independent of the report envelope (ADR 0011). */
export const RESOLUTION_SCHEMA_VERSION = "1.0.0";

export const DIGEST_FIELDS = Object.freeze([
  "title",
  "description",
  "appliesTo",
  "assurance",
  "validationType",
  "attestable",
  "introducedIn",
  "deprecatedIn",
  "supersededBy",
  "removedIn",
  "aliases",
  "remediation",
  "level",
  "severity",
  "nonExemptible",
]);

const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HEX_DIGEST = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// digest
// ---------------------------------------------------------------------------

/** JSON with object keys sorted at every depth and no insignificant whitespace. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** The values the digest covers, as a plain object. `rule` is a loaded (post-default) rule. */
export function digestInput(rule) {
  const input = {};
  for (const field of DIGEST_FIELDS) input[field] = rule[field] === undefined ? null : rule[field];
  if (Array.isArray(input.aliases)) input.aliases = [...input.aliases].sort();
  return input;
}

export function ruleDigest(rule) {
  return createHash("sha256").update(canonicalJson(digestInput(rule))).digest("hex");
}

/** { ruleId: digest } for every rule in a loaded catalog, in id order. */
export function catalogDigests(catalog) {
  const out = {};
  for (const id of [...catalog.rules.keys()].sort()) out[id] = ruleDigest(catalog.rules.get(id));
  return out;
}

// ---------------------------------------------------------------------------
// versions
// ---------------------------------------------------------------------------

function parseVersion(v) {
  const m = typeof v === "string" ? STRICT_SEMVER.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Numeric three-part comparison. Returns null when either side is not a strict x.y.z. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/**
 * The newest `introducedIn` over the whole catalog. Computed, never a literal (A7). Values that
 * are not strict x.y.z are skipped here and reported by E3 itself.
 */
export function introductionBound(catalog) {
  let bound = null;
  for (const rule of catalog.rules.values()) {
    if (!parseVersion(rule.introducedIn)) continue;
    if (bound === null || compareVersions(rule.introducedIn, bound) > 0) bound = rule.introducedIn;
  }
  return bound;
}

// ---------------------------------------------------------------------------
// the register
// ---------------------------------------------------------------------------

/**
 * Read the register. Returns `{ register, state }` where state is "read", "missing", "unreadable"
 * (not JSON, or unreadable) or "malformed" (JSON of the wrong shape). Never throws: a register
 * that cannot be read is E1's business, and E1 turns it into NOT_EVALUATED.
 */
export async function readRegister(file = REGISTER_PATH) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    return { register: null, state: error?.code === "ENOENT" ? "missing" : "unreadable" };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { register: null, state: "unreadable" };
  }
  const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!plain(parsed) || typeof parsed.digestScheme !== "string" || !plain(parsed.releases)) {
    return { register: null, state: "malformed" };
  }
  return { register: parsed, state: "read" };
}

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------

/**
 * Establish E1, E2 and E3 for `declared`. Pure: it reads nothing and takes no records.
 *
 * Returns the resolution document. `failed` lists the establishments that failed; an establishment
 * that was not attempted (E2 and E3 after an E1 failure, per D7) is `not-attempted`, never `fails`.
 */
export function resolveVersion({ declared, catalog, register, registerState = "read", packVersion }) {
  const doc = {
    resolutionSchemaVersion: RESOLUTION_SCHEMA_VERSION,
    kind: "standard-version-resolution",
    attempted: true,
    declaredVersion: declared,
    packVersion: packVersion ?? null,
    digestScheme: DIGEST_SCHEME,
    registerState: "read",
    resolved: false,
    outcome: "NOT_EVALUATED",
    failed: [],
    e1: { status: "fails", reasons: [] },
    e2: { status: "not-attempted", reasons: [], mismatched: [], removed: [], unanswerable: [] },
    e3: { status: "not-attempted", bound: null, reasons: [], offending: [] },
  };

  // E1 — existence, by lookup.
  const releases = register?.releases;
  if (!releases || typeof releases !== "object") {
    const state = register ? "malformed" : registerState === "read" ? "missing" : registerState;
    doc.registerState = state;
    doc.e1.reasons.push(`register-${state}`);
  } else if (!Object.prototype.hasOwnProperty.call(releases, declared)) {
    doc.e1.reasons.push("not-in-register");
  } else {
    doc.e1.status = "holds";
  }
  if (doc.e1.status !== "holds") {
    doc.failed.push("E1");
    return doc;
  }

  // E2 — compatibility, over the recorded ids only.
  const entry = releases[declared] ?? {};
  const recorded = entry.rules !== null && typeof entry.rules === "object" && !Array.isArray(entry.rules) ? entry.rules : {};
  const ids = Object.keys(recorded).sort();
  const e2 = doc.e2;
  if (ids.length === 0) {
    e2.reasons.push("no-digest-recorded");
  } else {
    const comparable = register.digestScheme === DIGEST_SCHEME;
    for (const id of ids) {
      const rule = catalog.rules.get(id);
      if (!rule) {
        e2.removed.push(id);
        continue;
      }
      if (!comparable) continue;
      const digest = recorded[id];
      if (typeof digest !== "string" || !HEX_DIGEST.test(digest)) e2.unanswerable.push(id);
      else if (digest !== ruleDigest(rule)) e2.mismatched.push(id);
    }
    if (e2.removed.length > 0) e2.reasons.push("rule-removed");
    if (e2.mismatched.length > 0) e2.reasons.push("digest-mismatch");
    if (!comparable) e2.reasons.push("digest-scheme-unrecognised");
    if (e2.unanswerable.length > 0) e2.reasons.push("digest-unusable");
  }
  // A measured change outranks an unanswerable question: the pack answered, and said "changed".
  if (e2.removed.length > 0 || e2.mismatched.length > 0) e2.status = "changed";
  else if (e2.reasons.length > 0) e2.status = "unanswerable";
  else e2.status = "holds";

  // E3 — the introduction bound, catalog-wide.
  const e3 = doc.e3;
  e3.bound = introductionBound(catalog);
  const rules = [...catalog.rules.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const rule of rules) {
    const cmp = compareVersions(rule.introducedIn, declared);
    if (cmp === null) {
      e3.offending.push({ id: rule.id, introducedIn: rule.introducedIn });
      if (!e3.reasons.includes("introduced-in-unparsable")) e3.reasons.push("introduced-in-unparsable");
    } else if (cmp > 0) {
      e3.offending.push({ id: rule.id, introducedIn: rule.introducedIn });
      if (!e3.reasons.includes("rule-newer-than-declared")) e3.reasons.push("rule-newer-than-declared");
    }
  }
  const upper = compareVersions(declared, packVersion);
  if (upper === null) e3.reasons.push("pack-version-unparsable");
  else if (upper > 0) e3.reasons.push("declared-exceeds-pack-version");
  e3.status = e3.reasons.length === 0 ? "holds" : "fails";

  if (e2.status !== "holds") doc.failed.push("E2");
  if (e3.status !== "holds") doc.failed.push("E3");
  doc.resolved = doc.failed.length === 0;
  doc.outcome = doc.resolved ? "RESOLVED" : "NOT_EVALUATED";
  return doc;
}

/** The document for a run in which no declared version was available to resolve. */
export function notAttempted(reason, detail = null) {
  return {
    resolutionSchemaVersion: RESOLUTION_SCHEMA_VERSION,
    kind: "standard-version-resolution",
    attempted: false,
    reason,
    detail,
    declaredVersion: null,
    resolved: false,
    outcome: "NOT_ATTEMPTED",
    failed: [],
  };
}

const LABEL = { E1: "E1 existence", E2: "E2 compatibility", E3: "E3 introduction bound" };

/** One readable sentence-per-establishment description of a failed resolution. */
export function describeFailure(doc) {
  if (!doc.attempted) return `the declared standardVersion was not resolved: ${doc.reason}${doc.detail ? ` (${doc.detail})` : ""}`;
  const parts = [];
  for (const key of doc.failed) {
    const e = doc[key.toLowerCase()];
    let more = "";
    if (key === "E2") {
      const ids = [...e.removed, ...e.mismatched, ...e.unanswerable];
      more = ids.length ? `: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? `, +${ids.length - 5} more` : ""}` : "";
    } else if (key === "E3") {
      more = e.offending.length
        ? `: ${e.offending.slice(0, 5).map((o) => `${o.id} (introduced ${o.introducedIn})`).join(", ")}${e.offending.length > 5 ? `, +${e.offending.length - 5} more` : ""}`
        : "";
    }
    parts.push(`${LABEL[key]} failed [${e.reasons.join(", ")}]${more}`);
  }
  return `standardVersion ${doc.declaredVersion} did not resolve: ${parts.join("; ")}`;
}

// ---------------------------------------------------------------------------
// the print-only helper
// ---------------------------------------------------------------------------

/** A register fragment for `version` computed from `catalog`. Provenance is left to the human. */
export function candidateEntry(catalog, version) {
  return { digestScheme: DIGEST_SCHEME, releases: { [version]: { rules: catalogDigests(catalog) } } };
}

async function cli(argv) {
  const [command, ...flags] = argv;
  let version = null;
  let rulesDir;
  try {
    if (command !== "print") throw new Error(`unknown command '${command ?? ""}' (only 'print' exists; there is no write mode)`);
    for (const flag of flags) {
      if (flag.startsWith("--version=")) version = flag.slice("--version=".length);
      else if (flag.startsWith("--rules-dir=")) rulesDir = path.resolve(flag.slice("--rules-dir=".length));
      else throw new Error(`unknown flag '${flag}'`);
    }
    if (!parseVersion(version)) throw new Error("--version=<x.y.z> is required");
  } catch (error) {
    process.stderr.write(`release-register: ${error.message}\nUsage: node scripts/release-register.mjs print --version=<x.y.z> [--rules-dir=<dir>]\n`);
    process.exitCode = 2;
    return;
  }
  let catalog;
  try {
    catalog = await loadCatalog(rulesDir);
  } catch (error) {
    process.stderr.write(`release-register: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(JSON.stringify(candidateEntry(catalog, version), null, 2) + "\n");
  process.stderr.write(
    "release-register: printed a candidate only. Nothing was written. Review it, add provenance " +
      "(commit range or tag, and the rules tree it was taken from), and commit it by hand.\n",
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await cli(process.argv.slice(2));
}
