/**
 * Detector tests, under paired-mutation discipline.
 *
 * WHY THE FIXTURES ARE SHAPED THIS WAY. The obvious approach is one JSON file per violation, but
 * twenty-six near-identical records rot: they drift apart under maintenance, and when a shared field
 * changes, the "corrected twin" of a known-negative stops being a twin without anyone noticing. Then
 * a test that was proving a detector fires starts proving something else.
 *
 * So there are two fixture records on disk — one compliant prediction, one compliant abstention —
 * and every known-negative is a named mutation of one of them. The corrected twin IS the base
 * record, so the pair cannot drift by construction, and each case reads as a single line saying
 * exactly what makes the record bad.
 *
 * Each MUTATIONS entry asserts BOTH halves, which is the discipline that matters:
 *   1. the mutated record produces the expected rule's finding, and
 *   2. the unmutated base produces no finding for that rule.
 * Without (2) a detector that fires unconditionally would pass every test in the file.
 *
 * DETERMINISM. Every test pins `asOf`. Nothing here reads the wall clock, so these tests will still
 * pass in 2030.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalog } from "../scripts/catalog.mjs";
import {
  DEFAULT_PARAMETERS,
  EVALUATED_RULES,
  durationToMs,
  inspect,
  inspectSchema,
  inspectSeries,
  rawImplied,
  recordApplicability,
  statedDecimals,
} from "../scripts/records.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AS_OF = "2026-08-09T12:00:00Z";

const schema = JSON.parse(await readFile(path.join(ROOT, "schemas/prediction-record.schema.json"), "utf8"));
const catalog = await loadCatalog();

const PREDICTION = JSON.parse(
  await readFile(path.join(ROOT, "test/fixtures/records/compliant-prediction.json"), "utf8"),
);
const ABSTENTION = JSON.parse(
  await readFile(path.join(ROOT, "test/fixtures/records/compliant-abstention.json"), "utf8"),
);

/** The project vocabulary the fixtures refer to, mirroring this repository's own policy. */
const PARAMETERS = {
  ...DEFAULT_PARAMETERS,
  confidenceVocabulary: [
    { tier: "low", definition: "Wide interval or few sources." },
    { tier: "moderate", definition: "Interval width between 0.10 and 0.25, at least three independent sources." },
    { tier: "high", definition: "Interval width below 0.10 and calibration measured out of sample." },
  ],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const findingsFor = (record, parameters = PARAMETERS) =>
  inspect({ record, schema, parameters, asOf: AS_OF });
const rulesFired = (record, parameters) => new Set(findingsFor(record, parameters).map((f) => f.rule));

/**
 * base    which fixture the mutation applies to
 * rule    the rule that MUST fire once mutated, and MUST NOT fire before
 * mutate  the single change that makes the record bad
 */
const MUTATIONS = [
  // --- Standard 1: probability definition ---
  {
    name: "a record with no outcome definition cannot be resolved",
    base: "prediction",
    rule: "probability.definition-complete",
    mutate: (r) => delete r.subject.outcomeDefinition,
  },
  {
    name: "a probability above 1 is not a probability",
    base: "prediction",
    rule: "probability.in-unit-interval",
    mutate: (r) => (r.output.probability = 1.4),
  },
  {
    name: "an ensemble member probability outside the unit interval is caught too",
    base: "prediction",
    rule: "probability.in-unit-interval",
    mutate: (r) => (r.ensemble.members[1].probability = 64),
  },

  // --- Standard 2: uncertainty ---
  {
    name: "a prediction with no interval overstates what is known",
    base: "prediction",
    rule: "uncertainty.interval-present",
    mutate: (r) => delete r.output.interval,
  },
  {
    name: "an interval that excludes its own estimate is incoherent",
    base: "prediction",
    rule: "uncertainty.interval-coherent",
    mutate: (r) => (r.output.interval.upper = 0.58),
  },
  {
    name: "an interval with the bounds the wrong way round is incoherent",
    base: "prediction",
    rule: "uncertainty.interval-coherent",
    mutate: (r) => {
      r.output.interval.lower = 0.7;
      r.output.interval.upper = 0.55;
    },
  },

  // --- Standard 3: calibration ---
  {
    name: "a calibration score with no measurement behind it is a claim to have checked",
    base: "prediction",
    rule: "calibration.claim-requires-measurement",
    mutate: (r) => {
      r.calibration = { measured: false, score: { metric: "brier", value: 0.11 } };
    },
  },
  {
    name: "a measured calibration claim must name its dataset",
    base: "prediction",
    rule: "calibration.claim-requires-measurement",
    mutate: (r) => delete r.calibration.dataset,
  },
  {
    name: "a historical record with no information cutoff cannot be checked for lookahead",
    base: "prediction",
    rule: "calibration.no-lookahead-generation",
    mutate: (r) => (r.provenance.historical = { isHistorical: true }),
  },
  {
    name: "a historical record drawing on data from after its cutoff is remembering, not predicting",
    base: "prediction",
    rule: "calibration.no-lookahead-generation",
    mutate: (r) => {
      r.provenance.historical = { isHistorical: true, informationCutoff: "2026-08-08T00:00:00Z" };
    },
  },

  // --- Standard 4: baseline ---
  {
    name: "a record with no baseline and no declared absence gives nothing to judge against",
    base: "prediction",
    rule: "baseline.present-or-declared-absent",
    mutate: (r) => delete r.baseline,
  },
  {
    name: "a baseline must say what population it is a rate over",
    base: "prediction",
    rule: "baseline.source-stated",
    mutate: (r) => delete r.baseline.basis,
  },

  // --- Standard 5: freshness ---
  {
    name: "a record that does not say when its data was current cannot be checked for staleness",
    base: "prediction",
    rule: "data.freshness-declared",
    mutate: (r) => delete r.data.freshness.dataAsOf,
  },
  {
    name: "data past its freshness window with no account of staleness",
    base: "prediction",
    rule: "data.staleness-accounted",
    mutate: (r) => (r.data.freshness.dataAsOf = "2026-07-01T00:00:00Z"),
  },

  // --- Standard 6: missing information ---
  {
    name: "completeness must be declared, not omitted",
    base: "prediction",
    rule: "data.completeness-declared",
    mutate: (r) => delete r.data.completeness,
  },
  {
    name: "critical information missing with no justification for predicting anyway",
    base: "prediction",
    rule: "data.missing-critical-blocks",
    mutate: (r) => (r.data.completeness.criticalMissing = ["The launch-day price"]),
  },

  // --- Standard 7: sample size ---
  {
    name: "a sample with no unit is uninterpretable",
    base: "prediction",
    rule: "data.sample-size-declared",
    mutate: (r) => delete r.data.sampleSize.unit,
  },
  {
    name: "a sample below the project minimum with no justification",
    base: "prediction",
    rule: "data.sample-size-sufficient",
    mutate: (r) => (r.data.sampleSize.n = 12),
  },

  // --- Standard 8: outliers ---
  {
    name: "outliers detected but no account of how they were treated",
    base: "prediction",
    rule: "data.outliers-handled",
    mutate: (r) => delete r.data.outliers.handling,
  },

  // --- Standard 9: regime ---
  {
    name: "a record that never assessed the regime says so",
    base: "prediction",
    rule: "regime.change-assessed",
    mutate: (r) => delete r.regime.assessed,
  },
  {
    name: "a detected regime change that is not accounted for",
    base: "prediction",
    rule: "regime.change-accounted",
    mutate: (r) => (r.regime.changeDetected = true),
  },

  // --- Standards 10 and 11: ensemble ---
  {
    name: "an ensemble member with no version cannot be reproduced",
    base: "prediction",
    rule: "ensemble.members-enumerated",
    mutate: (r) => delete r.ensemble.members[0].version,
  },
  {
    name: "an ensemble that does not say how members were combined",
    base: "prediction",
    rule: "ensemble.aggregation-stated",
    mutate: (r) => delete r.ensemble.aggregation.method,
  },
  {
    name: "members spanning more than the threshold with the disagreement undeclared",
    base: "prediction",
    rule: "ensemble.disagreement-declared",
    mutate: (r) => (r.ensemble.members[0].probability = 0.3),
  },
  {
    name: "a stated spread that does not match the members it claims to summarise",
    base: "prediction",
    rule: "ensemble.disagreement-declared",
    mutate: (r) => (r.ensemble.disagreement.spread = 0.01),
  },
  {
    name: "a model excluded without a reason is indistinguishable from one dropped for disagreeing",
    base: "prediction",
    rule: "ensemble.no-cherry-picking",
    mutate: (r) => (r.ensemble.excluded = [{ name: "outlier-model", version: "1.0.0", reason: "" }]),
  },

  // --- Standard 12: false precision ---
  {
    name: "a probability stated to more decimals than the sample supports",
    base: "prediction",
    rule: "precision.supported-by-sample",
    mutate: (r) => {
      r.data.sampleSize.n = 40;
      r.output.probability = 0.6237;
      r.output.probabilityStated = "0.6237";
    },
  },
  {
    name: "an edge below the materiality threshold presented without explanation",
    base: "prediction",
    rule: "precision.material-difference-justified",
    mutate: (r) => {
      r.market.impliedProbability = 0.6195;
      r.edge.value = 0.0005;
      delete r.market.raw;
      delete r.expectedValue;
    },
  },

  // --- Standard 13: expiration ---
  {
    name: "a prediction with no expiry will be quoted forever",
    base: "prediction",
    rule: "expiration.expiry-present",
    mutate: (r) => delete r.expiresAt,
  },
  {
    name: "an expiry before the generation describes a prediction that was never valid",
    base: "prediction",
    rule: "expiration.expiry-after-generation",
    mutate: (r) => (r.expiresAt = "2026-08-08T06:00:00Z"),
  },

  // --- Standards 14 and 15: market, edge, expected value ---
  {
    name: "a prediction with no market reference and no declared absence",
    base: "prediction",
    rule: "market.reference-present-or-declared-absent",
    mutate: (r) => delete r.market,
  },
  {
    name: "an implied probability that does not follow from the quoted prices",
    base: "prediction",
    rule: "market.implied-probability-consistent",
    mutate: (r) => (r.market.raw[0].price = 1.4),
  },
  {
    name: "quoted prices summing above one with the margin left in",
    base: "prediction",
    rule: "market.vig-removed",
    mutate: (r) => (r.market.vig = { removed: false, method: "none-needed" }),
  },
  {
    name: "an edge stated against a market the record does not carry",
    base: "prediction",
    rule: "edge.requires-market-reference",
    mutate: (r) => (r.market = { declaredAbsent: true, reason: "no liquid market" }),
  },
  {
    name: "a stated edge that is not the difference it claims to be",
    base: "prediction",
    rule: "edge.recomputable",
    mutate: (r) => (r.edge.value = 0.19),
  },
  {
    name: "a fabricated edge is caught by the same recomputation",
    base: "prediction",
    rule: "edge.not-fabricated",
    mutate: (r) => (r.edge.value = 0.19),
  },
  {
    name: "an expected value with no stake context is a relabelled probability",
    base: "prediction",
    rule: "ev.requires-stake-context",
    mutate: (r) => delete r.expectedValue.stake,
  },
  {
    name: "an expected value computed from the payout as if it were the net win",
    base: "prediction",
    rule: "ev.recomputable",
    mutate: (r) => (r.expectedValue.value = 106.64),
  },

  // --- Standard 16: confidence ---
  {
    name: "a tier outside the declared vocabulary has no definition behind it",
    base: "prediction",
    rule: "confidence.tier-from-vocabulary",
    mutate: (r) => (r.confidence.tier = "pretty sure"),
  },
  {
    name: "a numeric confidence invites arithmetic against the probability",
    base: "prediction",
    rule: "confidence.not-probability",
    mutate: (r) => (r.confidence.tier = "85%"),
  },
  {
    name: "an inline vocabulary that is declared but not carried",
    base: "prediction",
    rule: "confidence.definitions-declared",
    mutate: (r) => (r.confidence = { tier: "moderate", vocabularyRef: "inline" }),
  },

  // --- Standard 17: abstention ---
  {
    name: "an abstention must not carry an edge",
    base: "abstention",
    rule: "abstention.valid-shape",
    mutate: (r) => (r.edge = { value: 0.04, basis: "probability-minus-market-implied" }),
  },
  {
    name: "a prediction issued while the record declares its own evidence insufficient",
    base: "prediction",
    rule: "abstention.no-manufactured-prediction",
    mutate: (r) => {
      r.data.completeness.criticalMissing = ["The launch-day price"];
      r.data.sampleSize.n = 4;
    },
  },
];

for (const mutation of MUTATIONS) {
  test(mutation.name, () => {
    const base = mutation.base === "prediction" ? PREDICTION : ABSTENTION;

    // Half one: the base record is clean for this rule. Without this, a detector that fires
    // unconditionally would pass every test in this file.
    const before = rulesFired(clone(base));
    assert.ok(
      !before.has(mutation.rule),
      `the unmutated ${mutation.base} fixture already reports ${mutation.rule}; the pair is not a pair`,
    );

    // Half two: the mutation produces exactly the finding it is named for.
    const mutated = clone(base);
    mutation.mutate(mutated);
    const after = rulesFired(mutated);
    assert.ok(
      after.has(mutation.rule),
      `mutation did not produce ${mutation.rule}; it produced: ${[...after].join(", ") || "nothing"}`,
    );
  });
}

test("every rule named by a mutation exists in the catalog", () => {
  for (const mutation of MUTATIONS) {
    assert.ok(catalog.rules.has(mutation.rule), `${mutation.rule} is not a catalog rule`);
  }
});

test("both compliant fixtures produce no findings at all", () => {
  assert.deepEqual(findingsFor(clone(PREDICTION)), [], "the compliant prediction fixture must be clean");
  assert.deepEqual(findingsFor(clone(ABSTENTION)), [], "the compliant abstention fixture must be clean");
});

test("EVALUATED_RULES contains only rules the catalog defines", () => {
  for (const id of EVALUATED_RULES) {
    assert.ok(catalog.rules.has(id), `${id} is listed as evaluated but the catalog does not define it`);
  }
});

test("every rule a detector can report is listed in EVALUATED_RULES", () => {
  // The drift guard. A detector reporting against a rule missing from EVALUATED_RULES would have
  // its finding computed and then the rule reported not-evaluated — the finding would vanish.
  const listed = new Set(EVALUATED_RULES);
  const reported = new Set();
  for (const mutation of MUTATIONS) {
    const mutated = clone(mutation.base === "prediction" ? PREDICTION : ABSTENTION);
    mutation.mutate(mutated);
    for (const finding of findingsFor(mutated)) reported.add(finding.rule);
  }
  for (const id of reported) {
    assert.ok(listed.has(id), `${id} is reported by a detector but missing from EVALUATED_RULES`);
  }
});

test("a rule with no detector is never listed as evaluated", () => {
  // The three outcome-bias and lookahead-evaluation rules concern how people reason about resolved
  // predictions, and the record carries no outcome at all. Listing them would claim a check exists.
  for (const id of [
    "calibration.no-lookahead-evaluation",
    "calibration.no-outcome-vindication",
    "calibration.no-outcome-condemnation",
    "integrity.no-manipulation",
  ]) {
    assert.ok(!EVALUATED_RULES.includes(id), `${id} has no detector and must not be listed as evaluated`);
  }
});

test("an abstention reports prediction-only rules as not-applicable, with a reason", () => {
  const applicability = recordApplicability(ABSTENTION);
  for (const id of ["edge.recomputable", "expiration.expiry-present", "confidence.tier-from-vocabulary"]) {
    assert.ok(applicability.has(id), `${id} should be not-applicable to an abstention`);
    assert.match(applicability.get(id), /abstention/i);
  }
  // And it must NOT excuse the rules that apply to every record.
  for (const id of ["baseline.present-or-declared-absent", "data.freshness-declared", "record.identity-present"]) {
    assert.ok(!applicability.has(id), `${id} applies to every record and must not be excused`);
  }
});

test("a declared market absence carries the record's own words as the reason", () => {
  const record = clone(PREDICTION);
  record.market = { declaredAbsent: true, reason: "no liquid market exists for this event" };
  delete record.edge;
  const applicability = recordApplicability(record);
  assert.match(applicability.get("market.vig-removed"), /no liquid market exists/);
});

test("a prediction with no ensemble block has no ensemble rules to answer", () => {
  const record = clone(PREDICTION);
  delete record.ensemble;
  const applicability = recordApplicability(record);
  assert.ok(applicability.has("ensemble.disagreement-declared"));
  assert.match(applicability.get("ensemble.disagreement-declared"), /states no ensemble/i);
});

test("a not-applicable reason reports the absence, never what produced the prediction instead", () => {
  // The regression this locks down is R1, reproduced by all three adopters: the reason used to add
  // "a single method produced the prediction", which is not observable from an absent block. The
  // previous version of this test asserted the defect, which is how it survived three adoptions.
  const record = clone(PREDICTION);
  delete record.ensemble;
  const applicability = recordApplicability(record);
  for (const id of [
    "ensemble.members-enumerated",
    "ensemble.aggregation-stated",
    "ensemble.disagreement-declared",
    "ensemble.no-cherry-picking",
  ]) {
    const reason = applicability.get(id);
    assert.ok(reason, `${id} should be not-applicable`);
    assert.doesNotMatch(reason, /single method|one method|a single model/i, `${id}: ${reason}`);
  }
});

test("no not-applicable reason claims a fact about how the prediction was produced", () => {
  // The general form of R1. Every reason in the map must be a statement about the record's
  // declarations — absence, output type, or the record's own quoted words — and never an inference
  // about the producer's methodology.
  const record = clone(PREDICTION);
  delete record.ensemble;
  delete record.edge;
  delete record.expectedValue;
  record.market = { declaredAbsent: true, reason: "no liquid market exists for this event" };
  const reasons = [...recordApplicability(record).values()];
  assert.ok(reasons.length > 0);
  for (const reason of new Set(reasons)) {
    assert.doesNotMatch(reason, /\bproduced the prediction\b/i, reason);
  }
});

test("a methodology change across a series must be declared", () => {
  const first = clone(PREDICTION);
  const second = clone(PREDICTION);
  second.methodology.version = "5.0.0";
  second.generatedAt = "2026-08-10T06:00:00Z";
  const findings = inspectSeries([
    { file: "a.json", record: first },
    { file: "b.json", record: second },
  ]);
  assert.equal(findings.get("b.json")?.[0].rule, "probability.methodology-change-declared");
});

test("a declared methodology change across a series is accepted", () => {
  const first = clone(PREDICTION);
  const second = clone(PREDICTION);
  second.methodology.version = "5.0.0";
  second.methodology.changedFromPrevious = true;
  second.methodology.changeNote = "Replaced the analogue selector with a learned similarity metric.";
  second.generatedAt = "2026-08-10T06:00:00Z";
  const findings = inspectSeries([
    { file: "a.json", record: first },
    { file: "b.json", record: second },
  ]);
  assert.equal(findings.size, 0);
});

test("a methodology change without a seriesId is invisible, as the rule's assurance note says", () => {
  const first = clone(PREDICTION);
  const second = clone(PREDICTION);
  delete first.seriesId;
  delete second.seriesId;
  second.methodology.version = "5.0.0";
  second.generatedAt = "2026-08-10T06:00:00Z";
  const findings = inspectSeries([
    { file: "a.json", record: first },
    { file: "b.json", record: second },
  ]);
  assert.equal(findings.size, 0, "this is a known limit, asserted so it stays documented rather than surprising");
});

test("the schema must keep admitting abstention as a first-class output", () => {
  assert.deepEqual(inspectSchema(schema), []);

  const withoutAbstention = clone(schema);
  withoutAbstention.$defs.output.oneOf = [withoutAbstention.$defs.output.oneOf[0]];
  const findings = inspectSchema(withoutAbstention);
  assert.equal(findings[0]?.rule, "abstention.first-class-output");

  const softened = clone(schema);
  softened.$defs.output.oneOf[1].properties.statement.const = "probably not enough evidence";
  assert.equal(inspectSchema(softened)[0]?.rule, "abstention.first-class-output");
});

test("thresholds come from policy, and a stricter policy changes the outcome", () => {
  const record = clone(PREDICTION);
  record.data.sampleSize.n = 100;
  assert.ok(!rulesFired(record).has("data.sample-size-sufficient"), "100 clears the default minimum of 30");

  const strict = { ...PARAMETERS, minSampleSize: 500 };
  assert.ok(
    rulesFired(record, strict).has("data.sample-size-sufficient"),
    "the same record fails under a project that requires 500",
  );
});

test("findings distinguish observation from inference", () => {
  const record = clone(PREDICTION);
  record.output.probability = 1.4;
  const observed = findingsFor(record).find((f) => f.rule === "probability.in-unit-interval");
  assert.equal(observed.label, "OBSERVED", "a bound check rests on a defined structure");

  const heuristic = clone(PREDICTION);
  heuristic.data.sampleSize.n = 40;
  heuristic.output.probabilityStated = "0.6237";
  heuristic.output.probability = 0.6237;
  const inferred = findingsFor(heuristic).find((f) => f.rule === "precision.supported-by-sample");
  assert.equal(inferred.label, "INFERRED", "the standard-error bound is a heuristic and must say so");
});

test("evaluation is deterministic: the same inputs and asOf give the same findings", () => {
  const a = JSON.stringify(findingsFor(clone(PREDICTION)));
  const b = JSON.stringify(findingsFor(clone(PREDICTION)));
  assert.equal(a, b);
});

test("staleness is measured against asOf, not the wall clock", () => {
  // The record's data is one generation-day old. Moving asOf far into the future must not make it
  // stale, because staleness is measured at generation time.
  const record = clone(PREDICTION);
  const future = inspect({ record, schema, parameters: PARAMETERS, asOf: "2031-01-01T00:00:00Z" });
  assert.ok(!future.some((f) => f.rule === "data.staleness-accounted"));
});

test("statedDecimals prefers the string form JSON cannot preserve", () => {
  assert.equal(statedDecimals({ probability: 0.6, probabilityStated: "0.60" }), 2);
  assert.equal(statedDecimals({ probability: 0.6 }), 1);
  assert.equal(statedDecimals({ probability: 0.6237 }), 4);
});

test("prices convert to implied probabilities from every admitted format", () => {
  assert.ok(Math.abs(rawImplied({ price: 2, format: "decimal" }) - 0.5) < 1e-9);
  assert.ok(Math.abs(rawImplied({ price: 100, format: "american" }) - 0.5) < 1e-9);
  assert.ok(Math.abs(rawImplied({ price: -200, format: "american" }) - 0.6667) < 1e-3);
  assert.equal(rawImplied({ price: 0.42, format: "probability" }), 0.42);
});

test("durations parse, and an unparseable one is null rather than zero", () => {
  assert.equal(durationToMs("P7D"), 7 * 86400000);
  assert.equal(durationToMs("PT12H"), 12 * 3600000);
  // Zero would silently make everything stale; null lets the caller skip the check instead.
  assert.equal(durationToMs("7 days"), null);
});
