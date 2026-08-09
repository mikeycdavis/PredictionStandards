# 0005 — Record-level applicability, and thresholds in policy

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

Two gaps appeared once prediction records became the subject (ADR 0001).

**Applicability varies per record.** An abstention has no edge to recompute, no expiry to check, and
no ensemble to inspect. The inherited mechanism is policy-level: a project declares a rule
not-applicable. That is the wrong scope here — a project that makes edge-bearing predictions cannot
declare the edge rules not-applicable without waiving them for the records that *do* carry edges.

**Thresholds have nowhere to live.** A minimum sample size, a disagreement threshold, a materiality
floor: none comes from the source specifications, and all are needed to evaluate anything.

## Decision

Two additions.

1. The catalog gains `appliesTo: "prediction" | "abstention" | "any"`, defaulting to `"any"`. The
   evaluator emits `not-applicable` per record, quoting the record's own declaration as the reason —
   for example, `market.declaredAbsent.reason`.
2. The policy schema gains an optional `parameters` block: `minSampleSize`, `disagreementThreshold`,
   `materialityThreshold`, `tolerance`, `defaultFreshnessWindow`, `confidenceVocabulary`.

## Consequences

- Record applicability and policy applicability never merge. One is a fact about the artifact; the
  other is a claim about the project. Both are reported with a reason, and **neither can suppress a
  finding** — a rule with a finding against it is one whose subject demonstrably exists, so the
  failure survives either claim. That guard is tested.
- `appliesTo` defaults to `"any"` so silence means the widest scope. The opposite default would let a
  missing field quietly exempt a rule from every record.
- Every report publishes the `parameters` it used, so a verdict never rests on a threshold the reader
  cannot see, and the evaluator's defaults are documented as working values rather than facts about
  prediction quality.
- The YAML parser returns every scalar as a string by design, so the numeric parameters need one
  explicit conversion point. It is a named list of four keys in `scripts/policy.mjs` that refuses
  anything which is not a clean numeric literal — a silent `Number("high")` would put `NaN` into the
  middle of a verdict.
