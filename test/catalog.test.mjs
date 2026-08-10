/**
 * The catalog, the prohibition mapping, and the integrity ratchet.
 *
 * These tests protect the shape of the rule set itself. The ratchet tests matter most: they are the
 * mechanism Standard 18 R3 relies on, and a ratchet nobody has watched fail is a ratchet nobody
 * knows works.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalog, CatalogError, APPLIES_TO, LEVELS, SEVERITIES } from "../scripts/catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = await loadCatalog();
const inventory = JSON.parse(await readFile(path.join(ROOT, "artifacts/standards-source-inventory.json"), "utf8"));
const baseline = JSON.parse(await readFile(path.join(ROOT, "artifacts/integrity-baseline.json"), "utf8"));
const VERSION = (await readFile(path.join(ROOT, "VERSION"), "utf8")).trim();

const PROTECTED = ["level", "nonExemptible", "severity"];

test("the catalog loads and every rule carries the full field set", () => {
  assert.ok(catalog.rules.size > 0);
  for (const rule of catalog.rules.values()) {
    for (const field of ["title", "description", "rationale", "remediation", "introducedIn"]) {
      assert.ok(typeof rule[field] === "string" && rule[field].trim() !== "", `${rule.id} is missing ${field}`);
    }
    // Present even when null, from the first release: adding them later means every existing rule
    // silently lacks them and consumers treat their absence as meaningful.
    for (const field of ["deprecatedIn", "supersededBy", "removedIn"]) {
      assert.ok(field in rule, `${rule.id} is missing the lifecycle field ${field}`);
    }
    assert.ok(Array.isArray(rule.aliases), `${rule.id} has no aliases array`);
    assert.ok(APPLIES_TO.has(rule.appliesTo), `${rule.id} has an invalid appliesTo`);
    assert.ok(LEVELS.has(rule.level));
    assert.ok(SEVERITIES.has(rule.severity));
  }
});

test("this pack has no rule aliases, because identity was fixed before the first rule", () => {
  // An alias is a second name, and a second name is a thing that drifts. The reference architecture
  // needed one because it acquired two spellings before settling; this pack did not.
  assert.equal(catalog.aliases.size, 0);
});

test("every rule id is canonical kebab-case", () => {
  for (const id of catalog.rules.keys()) {
    assert.match(id, /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/, `${id} is not canonical`);
  }
});

test("every rule belongs to a standard in the series", () => {
  const numbers = new Set(inventory.standards.map((s) => s.number));
  for (const rule of catalog.rules.values()) {
    assert.ok(numbers.has(rule.standard), `${rule.id} claims standard ${rule.standard}, which is not in the series`);
  }
});

test("every prohibition maps to a forbidden-level rule, one to one", () => {
  assert.equal(inventory.prohibitions.length, inventory.expectedProhibitions);
  for (const prohibition of inventory.prohibitions) {
    const rule = catalog.rules.get(prohibition.rule);
    assert.ok(rule, `prohibition ${prohibition.number} names ${prohibition.rule}, which does not exist`);
    assert.equal(rule.level, "forbidden", `${rule.id} carries a prohibition but is not forbidden-level`);
    assert.equal(rule.standard, prohibition.standard, `${rule.id} disagrees with the inventory about its standard`);
  }
});

test("every forbidden-level rule carries a prohibition from the sources", () => {
  // The reverse direction. Without it, a forbidden rule could be invented that no source states.
  const claimed = new Set(inventory.prohibitions.map((p) => p.rule));
  for (const rule of catalog.rules.values()) {
    if (rule.level !== "forbidden") continue;
    assert.ok(claimed.has(rule.id), `${rule.id} is forbidden-level but no source prohibition maps to it`);
  }
});

test("the non-exemptible set is exactly the nine rules that cannot be waived", () => {
  const actual = [...catalog.rules.values()].filter((r) => r.nonExemptible).map((r) => r.id).sort();
  assert.deepEqual(actual, [
    "abstention.no-manufactured-prediction",
    "calibration.no-lookahead-evaluation",
    "calibration.no-lookahead-generation",
    "confidence.not-fabricated",
    "confidence.not-probability",
    "edge.not-fabricated",
    "integrity.no-manipulation",
    "probability.not-expected-value",
    "probability.not-fabricated",
  ]);
});

test("every non-exemptible rule is also forbidden-level", () => {
  // A non-exemptible rule that was merely `required` would be an obligation nobody may waive, which
  // is coherent but is not what any of these nine are: each states a must-never.
  for (const rule of catalog.rules.values()) {
    if (rule.nonExemptible) assert.equal(rule.level, "forbidden", `${rule.id} is non-exemptible but not forbidden`);
  }
});

test("every rule with less than full assurance explains what it does not establish", () => {
  // This is the honesty mechanism. A `partial` rule with no note is one whose limits nobody wrote
  // down, and a reader would take its pass at face value.
  for (const rule of catalog.rules.values()) {
    if (rule.assurance === "full") continue;
    assert.ok(
      typeof rule.$assuranceNote === "string" && rule.$assuranceNote.trim() !== "",
      `${rule.id} has assurance '${rule.assurance}' but no $assuranceNote`,
    );
  }
});

test("manual-review rules are attestable, or nothing could ever establish them", () => {
  for (const rule of catalog.rules.values()) {
    if (rule.validationType !== "manual-review") continue;
    assert.equal(rule.attestable, true, `${rule.id} is manual-review but not attestable`);
  }
});

// --- the integrity ratchet ---------------------------------------------------------------------

test("the baseline records every rule in the catalog, and nothing else", () => {
  const inCatalog = [...catalog.rules.keys()].sort();
  const inBaseline = Object.keys(baseline.rules).sort();
  assert.deepEqual(inBaseline, inCatalog);
});

test("every protection attribute matches the reviewed baseline", () => {
  for (const [id, recorded] of Object.entries(baseline.rules)) {
    const rule = catalog.rules.get(id);
    for (const field of PROTECTED) {
      assert.equal(rule[field], recorded[field], `${id}.${field} drifted from the baseline`);
    }
  }
});

/**
 * Mutation tests for the ratchet.
 *
 * The ratchet's whole value is that it fires. These reproduce each way a rule can be weakened
 * against an in-memory copy of the baseline and assert the comparison catches it. If any of these
 * stops failing, the mechanism Standard 18 R3 rests on has quietly stopped working.
 */
const detectDrift = (catalogRules, baselineRules) => {
  const drift = [];
  for (const [id, recorded] of Object.entries(baselineRules)) {
    const rule = catalogRules.get(id);
    if (!rule) {
      drift.push({ id, kind: "removed" });
      continue;
    }
    for (const field of PROTECTED) {
      if (rule[field] !== recorded[field]) drift.push({ id, kind: "changed", field });
    }
  }
  for (const id of catalogRules.keys()) {
    if (!(id in baselineRules)) drift.push({ id, kind: "unrecorded" });
  }
  return drift;
};

test("the ratchet catches a level downgrade", () => {
  const mutated = new Map(catalog.rules);
  mutated.set("edge.not-fabricated", { ...catalog.rules.get("edge.not-fabricated"), level: "recommended" });
  const drift = detectDrift(mutated, baseline.rules);
  assert.ok(drift.some((d) => d.id === "edge.not-fabricated" && d.field === "level"));
});

test("the ratchet catches nonExemptible being switched off", () => {
  const mutated = new Map(catalog.rules);
  mutated.set("probability.not-fabricated", { ...catalog.rules.get("probability.not-fabricated"), nonExemptible: false });
  const drift = detectDrift(mutated, baseline.rules);
  assert.ok(drift.some((d) => d.id === "probability.not-fabricated" && d.field === "nonExemptible"));
});

test("the ratchet catches a severity downgrade", () => {
  const mutated = new Map(catalog.rules);
  mutated.set("data.staleness-accounted", { ...catalog.rules.get("data.staleness-accounted"), severity: "info" });
  assert.ok(detectDrift(mutated, baseline.rules).some((d) => d.field === "severity"));
});

test("the ratchet catches a rule being deleted", () => {
  const mutated = new Map(catalog.rules);
  mutated.delete("confidence.not-probability");
  assert.ok(detectDrift(mutated, baseline.rules).some((d) => d.id === "confidence.not-probability" && d.kind === "removed"));
});

test("the ratchet catches a rule added without being recorded", () => {
  // Not a weakening, but a hole: the next edit to the new rule would be invisible.
  const mutated = new Map(catalog.rules);
  mutated.set("probability.sneaked-in", { ...catalog.rules.get("probability.not-fabricated"), id: "probability.sneaked-in" });
  assert.ok(detectDrift(mutated, baseline.rules).some((d) => d.kind === "unrecorded"));
});

test("the unmutated catalog produces no drift", () => {
  // The other half of the mutation discipline: without this, a detector that always reported drift
  // would pass every test above.
  assert.deepEqual(detectDrift(catalog.rules, baseline.rules), []);
});

test("the baseline is dated and names the standards version it was reviewed against", () => {
  // Compared against VERSION rather than a literal: a baseline reviewed against a superseded
  // standards version is a baseline nobody has looked at since the rules changed.
  assert.match(baseline.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(baseline.standardVersion, VERSION);
});

// --- loader strictness -------------------------------------------------------------------------

test("a malformed rule stops the catalog rather than shrinking it", async () => {
  // A catalog that loaded partially would silently shrink the denominator every score is computed
  // over, and the missing rules would report as not-evaluated rather than as an error.
  await assert.rejects(() => loadCatalog(path.join(ROOT, "test/fixtures/bad-rules")), CatalogError);
});
