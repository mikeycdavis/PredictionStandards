/**
 * Standard 19, and the five structures that define it.
 *
 * These are not illustrations. Adoption #3 built S1–S5 to discover what property a falsifiability
 * rule has to target, and the answer — falsifiability at prediction time, not independence and not
 * externality — is only visible in the contrast between them. S5 in particular is resolved by the
 * same system running the same method on the same data, and is legitimate. A future simplification
 * that requires an independent or external resolver would reject S2 and S5, and this file is what
 * stops it from doing so quietly.
 *
 * Any change here that alters one of the five dispositions has to explain why.
 * See standards/19-outcome-falsifiability.md and artifacts/release-review/v1.1-evidence-review.md.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalog } from "../scripts/catalog.mjs";
import { evaluate, STATUS } from "../scripts/compliance.mjs";
import {
  resolveParameters,
  EVALUATED_RULES,
  FALSIFIABILITY_SINCE,
  atLeastRecordSchema,
  inspect,
  recordApplicability,
  recordNotEvaluated,
} from "../scripts/records.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "test/fixtures/records/falsifiability");
const AS_OF = "2026-06-20T11:00:00Z";

const schema = JSON.parse(await readFile(path.join(ROOT, "schemas/prediction-record.schema.json"), "utf8"));
const catalog = await loadCatalog();

const load = async (name) => JSON.parse(await readFile(path.join(FIXTURES, name), "utf8"));

/**
 * The confidence vocabulary these fixtures were written against, transcribed from Adoption #3's
 * policy. Supplied so the only thing that varies between the five structures is the property under
 * test — without it every fixture would also fail `confidence.tier-from-vocabulary` and the
 * dispositions below would be measuring the wrong thing.
 */
const POLICY = {
  standardVersion: "1.1.0",
  project: "falsifiability-fixtures",
  parameters: {
    confidenceVocabulary: [
      { tier: "low", definition: "Few retrievable signals, or retrieval degraded." },
      { tier: "moderate", definition: "Most signal families present and the page fully retrieved." },
      { tier: "high", definition: "All five signal families present, full retrieval, calibration measured." },
    ],
  },
};

/** Evaluate a record end to end, exactly as `predictions check` does. */
function judge(record) {
  const findings = inspect({ record, schema, parameters: resolveParameters(POLICY), asOf: AS_OF });
  const verdict = evaluate({
    catalog,
    policy: POLICY,
    findings,
    evaluated: EVALUATED_RULES,
    today: AS_OF.slice(0, 10),
    recordApplicability: recordApplicability(record),
    recordNotEvaluated: recordNotEvaluated(record),
  });
  const of = (id) => verdict.results.find((r) => r.ruleId === id);
  return { findings, verdict, of };
}

const STRUCTURAL = "falsifiability.declared";
const SUBSTANTIVE = "falsifiability.resolution-not-self-determined";

// --- The five structures ------------------------------------------------------------------------

test("S1 — a descriptive index is not a prediction, so the falsifiability rules do not reach it", async () => {
  const { of } = judge(await load("S1-descriptive-index.json"));
  for (const id of [STRUCTURAL, SUBSTANTIVE]) {
    assert.equal(of(id).status, "skipped", `${id} should not be evaluated against an abstention`);
  }
  assert.equal(of(STRUCTURAL).disposition, "not-applicable");
});

test("S2 — a score calibrated against a later blind review is permitted", async () => {
  const { of, verdict } = judge(await load("S2-calibrated-to-future-outcome.json"));
  assert.equal(of(STRUCTURAL).status, "passed");
  assert.notEqual(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED);
});

test("S3 — a probability about a future external event is permitted", async () => {
  const { of, verdict } = judge(await load("S3-probability-to-future-external.json"));
  assert.equal(of(STRUCTURAL).status, "passed");
  assert.notEqual(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED);
});

test("S5 — the same system resolving its own future measurement is permitted", async () => {
  // The decisive case. Same analyzer, same methodology, same upstream pipeline: maximal
  // non-independence and zero externality, and entirely legitimate, because the measurement it
  // forecasts is not determined by making the forecast. Any rule that rejects this one has
  // mistaken independence for the property.
  const { of, verdict } = judge(await load("S5-forecast-of-future-derived-score.json"));
  assert.equal(of(STRUCTURAL).status, "passed");
  assert.notEqual(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED);
});

test("S4 — a record resolved against its own completed output is rejected", async () => {
  const { of, verdict, findings } = judge(await load("S4-circular-self-resolved.json"));
  assert.equal(of(STRUCTURAL).status, "failed");
  assert.equal(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED);
  assert.ok(findings.some((f) => f.rule === STRUCTURAL));
});

test("S2, S3, and S5 share no resolver property — only the outcome being open", async () => {
  // Guards R3 directly. If a future implementation reaches for independence or externality, this
  // is the assertion that documents why those two are not available.
  const s2 = await load("S2-calibrated-to-future-outcome.json");
  const s5 = await load("S5-forecast-of-future-derived-score.json");
  assert.match(s5.subject.resolutionSource, /did-analyzer|analyzer/i);
  assert.notEqual(s2.subject.resolutionSource, s5.subject.resolutionSource);
  for (const record of [s2, s5]) {
    assert.equal(judge(record).of(STRUCTURAL).status, "passed");
  }
});

// --- The assurance boundary ---------------------------------------------------------------------

test("the substantive rule is never established by an automated run, however clean the record", async () => {
  // Standard 19 R5. The pack establishes that the declaration was made, never that it is true.
  for (const name of [
    "S2-calibrated-to-future-outcome.json",
    "S3-probability-to-future-external.json",
    "S5-forecast-of-future-derived-score.json",
  ]) {
    const { of } = judge(await load(name));
    assert.equal(of(SUBSTANTIVE).status, "skipped", name);
    assert.equal(of(SUBSTANTIVE).disposition, "not-evaluated", name);
  }
});

test("a fabricated declaration passes the structural rule — the documented limit, not a surprise", async () => {
  // S4b. Adoption #3 defeated the resolveBy signal the same way, which is why that mechanism was
  // rejected in favour of a declaration. The gain is that the omission became a written falsehood,
  // reachable by Standard 18; it is not detection, and this test exists so nobody claims it is.
  const { of } = judge(await load("S4b-fabricated-declaration.json"));
  assert.equal(of(STRUCTURAL).status, "passed");
  assert.equal(of(SUBSTANTIVE).disposition, "not-evaluated");
});

// --- Compatibility (ADR 0008) -------------------------------------------------------------------

test("a legacy record is not evaluated for the new rule, and is never credited with passing it", async () => {
  const { of, verdict } = judge(await load("S4-legacy-schema.json"));
  const result = of(STRUCTURAL);
  assert.equal(result.status, "skipped");
  assert.equal(result.disposition, "not-evaluated");
  assert.notEqual(result.disposition, "not-applicable");
  assert.match(result.message, /1\.0\.0/);
  // The verdict for an untouched legacy corpus does not degrade.
  assert.notEqual(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED);
});

test("the same circular record fails once it declares the version that carries the field", async () => {
  // The pair that shows compatibility did not weaken the standard: identical evidence, identical
  // circularity, and the only difference is whether the record's format can answer the question.
  const legacy = await load("S4-legacy-schema.json");
  const current = await load("S4-circular-self-resolved.json");
  assert.equal(legacy.subject.resolutionSource, current.subject.resolutionSource);
  assert.equal(judge(legacy).of(STRUCTURAL).disposition, "not-evaluated");
  assert.equal(judge(current).of(STRUCTURAL).status, "failed");
});

test("a record declaring the outcome already determined fails rather than erroring", async () => {
  const record = await load("S4-circular-self-resolved.json");
  record.subject.falsifiability = {
    undeterminedAtGeneration: false,
    basis: "The overall score for this analysis was computed before this record was written.",
  };
  const { of, findings } = judge(record);
  assert.equal(of(STRUCTURAL).status, "failed");
  assert.match(findings.find((f) => f.rule === STRUCTURAL).message, /measurement or an index/i);
});

test("version comparison treats a missing or unparseable version as below every floor", () => {
  assert.equal(atLeastRecordSchema("1.1.0", FALSIFIABILITY_SINCE), true);
  assert.equal(atLeastRecordSchema("1.2.0", FALSIFIABILITY_SINCE), true);
  assert.equal(atLeastRecordSchema("2.0.0", FALSIFIABILITY_SINCE), true);
  assert.equal(atLeastRecordSchema("1.0.9", FALSIFIABILITY_SINCE), false);
  assert.equal(atLeastRecordSchema("1.0.0", FALSIFIABILITY_SINCE), false);
  assert.equal(atLeastRecordSchema(undefined, FALSIFIABILITY_SINCE), false);
  assert.equal(atLeastRecordSchema("banana", FALSIFIABILITY_SINCE), false);
});

test("not-applicable and not-evaluated stay distinct dispositions", () => {
  // ADR 0008. Collapsing them would let a compatibility gap wear the costume of an inapplicable
  // rule, which is R1's error one level up.
  const abstention = { output: { type: "abstention" }, schemaVersion: "1.0.0" };
  assert.equal(recordNotEvaluated(abstention).size, 0);
  const legacyPrediction = { output: { type: "prediction" }, schemaVersion: "1.0.0" };
  assert.equal(recordApplicability(legacyPrediction).has(STRUCTURAL), false);
  assert.equal(recordNotEvaluated(legacyPrediction).has(STRUCTURAL), true);
});

// --- Catalogue shape ----------------------------------------------------------------------------

test("Standard 19 introduces no prohibition and no forbidden rule", async () => {
  // Every forbidden rule in this pack maps to a prohibition a source stated. An evidence-derived
  // standard does not get to invent one.
  for (const rule of catalog.rules.values()) {
    if (rule.standard !== 19) continue;
    assert.equal(rule.level, "required", `${rule.id} must not be forbidden-level`);
    assert.equal(rule.nonExemptible, false, `${rule.id} must not be non-exemptible`);
  }
});

test("the substantive rule is catalogued as unautomatable and attestable, and says so", () => {
  const rule = catalog.rules.get(SUBSTANTIVE);
  assert.equal(rule.validationType, "manual-review");
  assert.equal(rule.assurance, "none");
  assert.equal(rule.attestable, true);
  assert.ok(!EVALUATED_RULES.includes(SUBSTANTIVE), "a manual-review rule must not claim a detector");
  assert.match(rule.$assuranceNote, /not claimed|no automated check/i);
});
