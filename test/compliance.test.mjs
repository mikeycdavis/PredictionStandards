/**
 * The verdict engine: what a set of findings, a policy, and a catalog add up to.
 *
 * The properties under test are the ones that make a verdict trustworthy rather than decorative:
 * a skipped rule is not a pass, a non-exemptible rule cannot be waived by any route, a human
 * attestation is evidence rather than an override, and a broken configuration reports as a
 * configuration fault rather than as a failing prediction.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { loadCatalog } from "../scripts/catalog.mjs";
import { evaluate, envelope, STATUS } from "../scripts/compliance.mjs";
import { EVALUATED_RULES } from "../scripts/records.mjs";

const catalog = await loadCatalog();
const TODAY = "2026-08-09";

const policyOf = (overrides = {}) => ({ standardVersion: "1.0.0", project: "test", ...overrides });

const run = ({ policy = policyOf(), findings = [], evaluated = EVALUATED_RULES, recordApplicability } = {}) =>
  evaluate({ catalog, policy, findings, evaluated, today: TODAY, recordApplicability });

const resultFor = (verdict, ruleId) => verdict.results.find((r) => r.ruleId === ruleId);

test("a clean record with a policy is SUPPORTED", () => {
  assert.equal(run().status, STATUS.SUPPORTED);
});

test("no policy means NOT_EVALUATED, never a failure", () => {
  // A missing policy is a configuration fault. Reporting it as INSUFFICIENTLY_SUPPORTED would say
  // something about the prediction, which nothing has established.
  assert.equal(run({ policy: null }).status, STATUS.NOT_EVALUATED);
});

test("an ordinary failing rule gives INSUFFICIENTLY_SUPPORTED", () => {
  const verdict = run({
    findings: [{ rule: "baseline.source-stated", message: "no basis", label: "OBSERVED", evidence: [] }],
  });
  assert.equal(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED);
  assert.equal(resultFor(verdict, "baseline.source-stated").status, "failed");
});

test("a rule nothing evaluated is skipped, never passed", () => {
  // The single most important property here: the difference between "no violation was observed"
  // and "nothing looked".
  const verdict = run({ evaluated: [] });
  const result = resultFor(verdict, "baseline.source-stated");
  assert.equal(result.status, "skipped");
  assert.equal(result.disposition, "not-evaluated");
  assert.notEqual(result.status, "passed");
});

test("a manual-review rule never passes on an automated run", () => {
  const result = resultFor(run(), "calibration.no-outcome-vindication");
  assert.equal(result.status, "skipped");
  assert.equal(result.disposition, "not-evaluated");
});

test("a failing non-exemptible rule blocks rather than merely failing", () => {
  const verdict = run({
    findings: [{ rule: "edge.not-fabricated", message: "edge does not recompute", label: "OBSERVED", evidence: [] }],
  });
  assert.equal(verdict.status, STATUS.BLOCKED_BY_INVARIANT);
  assert.deepEqual(verdict.blockedBy, ["edge.not-fabricated"]);
});

test("blocking outranks ordinary failure when both are present", () => {
  const verdict = run({
    findings: [
      { rule: "baseline.source-stated", message: "no basis", label: "OBSERVED", evidence: [] },
      { rule: "confidence.not-probability", message: "numeric tier", label: "OBSERVED", evidence: [] },
    ],
  });
  assert.equal(verdict.status, STATUS.BLOCKED_BY_INVARIANT);
});

test("an exception against a non-exemptible rule is rejected, not applied", () => {
  const verdict = run({
    policy: policyOf({
      exceptions: [
        { rule: "probability.not-fabricated", reason: "proprietary model", approvedBy: "someone", approvedAt: "2026-08-01" },
      ],
    }),
  });
  assert.equal(verdict.status, STATUS.BLOCKED_BY_INVARIANT);
  assert.equal(resultFor(verdict, "probability.not-fabricated").disposition, "rejected-exception");
});

test("a rejected exception also reports against the integrity rule", () => {
  // Two findings for one act: which protection was attacked, and what that amounts to.
  const verdict = run({
    policy: policyOf({
      exceptions: [
        { rule: "edge.not-fabricated", reason: "trust us", approvedBy: "someone", approvedAt: "2026-08-01" },
      ],
    }),
  });
  const integrity = resultFor(verdict, "integrity.no-manipulation");
  assert.equal(integrity.status, "failed");
  assert.equal(integrity.disposition, "invariant-violated");
  assert.match(integrity.message, /edge\.not-fabricated/);
});

test("a policy cannot downgrade a non-exemptible rule's level", () => {
  const verdict = run({
    policy: policyOf({ rules: { "confidence.not-probability": { level: "optional" } } }),
  });
  assert.equal(verdict.status, STATUS.BLOCKED_BY_INVARIANT);
  assert.equal(resultFor(verdict, "confidence.not-probability").disposition, "rejected-override");
});

test("a policy cannot declare a non-exemptible rule not-applicable", () => {
  const verdict = run({
    policy: policyOf({
      applicability: {
        "abstention.no-manufactured-prediction": { status: "not-applicable", reason: "inconvenient" },
      },
    }),
  });
  assert.equal(verdict.status, STATUS.BLOCKED_BY_INVARIANT);
  assert.equal(resultFor(verdict, "abstention.no-manufactured-prediction").disposition, "rejected-override");
});

test("a valid exception on an exemptible rule gives SUPPORTED_WITH_EXCEPTIONS", () => {
  const verdict = run({
    policy: policyOf({
      exceptions: [
        { rule: "baseline.source-stated", reason: "source is under embargo", approvedBy: "owner", approvedAt: "2026-08-01", expires: "2026-12-31" },
      ],
    }),
    findings: [{ rule: "baseline.source-stated", message: "no basis", label: "OBSERVED", evidence: [] }],
  });
  assert.equal(verdict.status, STATUS.SUPPORTED_WITH_EXCEPTIONS);
  assert.equal(resultFor(verdict, "baseline.source-stated").disposition, "excepted");
});

test("an expired exception is a failure, not a resolution", () => {
  const verdict = run({
    policy: policyOf({
      exceptions: [
        { rule: "baseline.source-stated", reason: "embargo", approvedBy: "owner", approvedAt: "2025-01-01", expires: "2026-01-01" },
      ],
    }),
  });
  assert.equal(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED);
  assert.equal(resultFor(verdict, "baseline.source-stated").disposition, "expired-exception");
});

test("an attestation establishes a manual-review rule", () => {
  const verdict = run({
    policy: policyOf({
      attestations: {
        "calibration.no-outcome-vindication": {
          status: "approved",
          reviewedBy: "owner",
          reviewedAt: "2026-08-01",
          evidence: "No outcome is recorded anywhere in the schema.",
        },
      },
    }),
  });
  const result = resultFor(verdict, "calibration.no-outcome-vindication");
  assert.equal(result.status, "passed");
  assert.equal(result.disposition, "attested");
  assert.equal(verdict.status, STATUS.SUPPORTED);
});

test("an attestation counts as human review, never as automation", () => {
  const verdict = run({
    policy: policyOf({
      attestations: {
        "calibration.no-outcome-vindication": {
          status: "approved",
          reviewedBy: "owner",
          reviewedAt: "2026-08-01",
          evidence: "reviewed",
        },
      },
    }),
  });
  assert.ok(verdict.assurance.manualReview >= 1);
});

test("an attestation never overrides what a check observed", () => {
  const verdict = run({
    policy: policyOf({
      attestations: {
        "calibration.claim-requires-measurement": {
          status: "approved",
          reviewedBy: "owner",
          reviewedAt: "2026-08-01",
          evidence: "I looked and it is fine",
        },
      },
    }),
    findings: [
      { rule: "calibration.claim-requires-measurement", message: "score with measured:false", label: "OBSERVED", evidence: [] },
    ],
  });
  const result = resultFor(verdict, "calibration.claim-requires-measurement");
  assert.equal(result.status, "failed");
  assert.equal(result.disposition, "contradicted-attestation");
});

test("a rejected attestation is a failure rather than silence", () => {
  const verdict = run({
    policy: policyOf({
      attestations: {
        "calibration.no-outcome-condemnation": {
          status: "rejected",
          reviewedBy: "owner",
          reviewedAt: "2026-08-01",
          evidence: "The team scores forecasters on hit rate.",
        },
      },
    }),
  });
  assert.equal(resultFor(verdict, "calibration.no-outcome-condemnation").disposition, "attested-rejected");
  assert.equal(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED);
});

test("an expired attestation returns the rule to not-evaluated", () => {
  const verdict = run({
    policy: policyOf({
      attestations: {
        "calibration.no-outcome-vindication": {
          status: "approved",
          reviewedBy: "owner",
          reviewedAt: "2025-01-01",
          evidence: "reviewed",
          expires: "2026-01-01",
        },
      },
    }),
  });
  assert.equal(resultFor(verdict, "calibration.no-outcome-vindication").disposition, "not-evaluated");
});

test("an attestation goes stale when what it reviewed changes", () => {
  const verdict = evaluate({
    catalog,
    policy: policyOf({
      attestations: {
        "calibration.no-outcome-vindication": {
          status: "approved",
          reviewedBy: "owner",
          reviewedAt: "2026-08-01",
          evidence: "reviewed",
          reviewedAgainst: { paths: ["schemas/prediction-record.schema.json"], digest: "aaaaaaaaaaaaaaaa" },
        },
      },
    }),
    findings: [],
    evaluated: EVALUATED_RULES,
    today: TODAY,
    digests: new Map([["calibration.no-outcome-vindication", "bbbbbbbbbbbbbbbb"]]),
  });
  assert.equal(resultFor(verdict, "calibration.no-outcome-vindication").disposition, "not-evaluated");
});

test("a rule the catalog says is not attestable cannot be attested", () => {
  const verdict = run({
    policy: policyOf({
      attestations: {
        "edge.recomputable": {
          status: "approved",
          reviewedBy: "owner",
          reviewedAt: "2026-08-01",
          evidence: "looks right to me",
        },
      },
    }),
  });
  assert.equal(resultFor(verdict, "edge.recomputable").disposition, "invalid-attestation");
});

test("record applicability removes a rule and reports the record's own reason", () => {
  const verdict = run({ recordApplicability: new Map([["edge.recomputable", "This record states no edge."]]) });
  const result = resultFor(verdict, "edge.recomputable");
  assert.equal(result.disposition, "not-applicable");
  assert.equal(result.message, "This record states no edge.");
});

test("no applicability claim can suppress a finding", () => {
  // A finding proves the subject exists, so both applicability mechanisms must yield to it.
  // Otherwise "this rule does not apply here" becomes a way to delete evidence.
  const viaRecord = run({
    recordApplicability: new Map([["baseline.source-stated", "claimed inapplicable"]]),
    findings: [{ rule: "baseline.source-stated", message: "no basis", label: "OBSERVED", evidence: [] }],
  });
  assert.equal(resultFor(viaRecord, "baseline.source-stated").status, "failed");
  assert.equal(viaRecord.status, STATUS.INSUFFICIENTLY_SUPPORTED);

  const viaPolicy = run({
    policy: policyOf({
      applicability: { "baseline.source-stated": { status: "not-applicable", reason: "we do not use baselines" } },
    }),
    findings: [{ rule: "baseline.source-stated", message: "no basis", label: "OBSERVED", evidence: [] }],
  });
  assert.equal(resultFor(viaPolicy, "baseline.source-stated").status, "failed");
});

test("an applicability claim with no finding against it is honoured", () => {
  // The mechanism must still work, or the hardening above would have removed it entirely.
  const verdict = run({
    policy: policyOf({
      applicability: { "baseline.source-stated": { status: "not-applicable", reason: "no baseline exists for this domain" } },
    }),
  });
  assert.equal(resultFor(verdict, "baseline.source-stated").disposition, "not-applicable");
  assert.equal(verdict.status, STATUS.SUPPORTED);
});

test("status is computed from rules, never from the score", () => {
  const verdict = run({
    findings: [{ rule: "baseline.source-stated", message: "no basis", label: "OBSERVED", evidence: [] }],
  });
  assert.ok(verdict.score >= 90, "one failure out of many still scores high");
  assert.equal(verdict.status, STATUS.INSUFFICIENTLY_SUPPORTED, "and the verdict is still a failure");
});

test("the score denominator counts forbidden rules alongside required ones", () => {
  // Omitting them would let the score rise as prohibitions were added to the catalog.
  const verdict = run();
  const forbidden = [...catalog.rules.values()].filter((r) => r.level === "forbidden" && EVALUATED_RULES.includes(r.id));
  assert.ok(verdict.denominator.scored >= forbidden.length);
  assert.match(verdict.denominator.basis, /forbidden/);
});

test("the assurance breakdown accounts for every applicable rule", () => {
  const verdict = run();
  const applicable = verdict.results.filter((r) => r.disposition !== "not-applicable").length;
  const { automated, manualReview, notEvaluated } = verdict.assurance;
  assert.equal(automated + manualReview + notEvaluated, applicable);
});

test("framework coverage sits beside the verdict, never inside it", () => {
  const verdict = run();
  const report = envelope({
    verdict,
    evaluatedAt: "2026-08-09T12:00:00Z",
    asOf: "2026-08-09T12:00:00Z",
    frameworkCoverage: { cataloguedRules: 50, evaluatedRules: 46 },
  });
  assert.equal(report.status, STATUS.SUPPORTED);
  assert.ok("frameworkCoverage" in report);
  // The score must not have absorbed coverage: it is computed from evaluated rules only.
  assert.notEqual(report.score, null);
  assert.equal(report.frameworkCoverage.cataloguedRules, 50);
});

test("the envelope publishes the thresholds the verdict was reached under", () => {
  const report = envelope({
    verdict: run(),
    evaluatedAt: "2026-08-09T12:00:00Z",
    asOf: "2026-08-09T12:00:00Z",
    parameters: { minSampleSize: 30, materialityThreshold: 0.01 },
  });
  assert.equal(report.parameters.minSampleSize, 30);
  assert.equal(report.asOf, "2026-08-09T12:00:00Z");
});
