# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Three version streams evolve independently and are recorded separately below:

- **Standards version** (`VERSION`) — the normative series and the rule catalog.
- **Report schema version** — the `schemaVersion` field in the evaluation envelope.
- **Record schema version** — the `schemaVersion` field a prediction record declares.

Any change that weakens a rule's protection attributes (`level`, `nonExemptible`, `severity`) MUST
appear here naming the rule id, alongside the matching edit to `artifacts/integrity-baseline.json`.
A test enforces this: weakening a rule silently is the manipulation Standard 18 prohibits.

## [Unreleased]

Version 1.1.0 in progress. Every change below traces to a disposition in
[`artifacts/release-review/v1.1-evidence-review.md`](artifacts/release-review/v1.1-evidence-review.md),
which is the decision record for this release. No change originates outside candidates C1–C10.

### Changed

- **C1 — the ensemble not-applicable reason no longer asserts what produced the prediction.** It read
  `"This record names no ensemble; a single method produced the prediction."` The second clause was
  inferred from a missing field and stated as observed, and Adoptions #1, #2, and #3 all found it —
  in #2 contradicted by a source that combines five weighted subscores. It now reads
  `"This record states no ensemble."` Applicability, rule identity, thresholds, and verdicts are
  unchanged: the disposition was correct in all three adopters, only the sentence was wrong.

## [1.0.0] — 2026-08-09

Initial release. Standards version 1.0.0, report schema 1.0, record schema 1.0.0.

### Added

- **18 standards.** Standards 1–17 from the domain brief's `Required standards` list, in its order;
  Standard 18 (Standards Integrity) from the standards-system specification's integrity invariant.
- **50 rules** across 16 categories. 19 carry `level: forbidden` and map one-to-one to the source
  prohibitions — 18 from the domain brief's must-never list plus the integrity invariant. Nine are
  `nonExemptible`: `abstention.no-manufactured-prediction`, `calibration.no-lookahead-evaluation`,
  `calibration.no-lookahead-generation`, `confidence.not-fabricated`, `confidence.not-probability`,
  `edge.not-fabricated`, `integrity.no-manipulation`, `probability.not-expected-value`,
  `probability.not-fabricated`.
- **The prediction-record schema**, in which probability, confidence, edge, and expected value are
  structurally distinct fields, and abstention is a first-class output variant carrying the fixed
  statement `NO PREDICTION / INSUFFICIENT EVIDENCE`.
- **The `predictions` command**: `init`, `audit`, `check`, `explain`, `status`. `--as-of` pins all
  staleness and expiry arithmetic so a run is reproducible.
- **Five verdicts**, including `BLOCKED_BY_INVARIANT`, which outranks `INSUFFICIENTLY_SUPPORTED` and
  means stop rather than try harder. A well-formed abstention reaches `SUPPORTED`.
- **The integrity ratchet**: `artifacts/integrity-baseline.json` plus `scripts/integrity.mjs`, gating
  CI on any drift in a rule's `level`, `nonExemptible`, or `severity`.
- **Invariant checks**: source inventory, verbatim-quote fidelity, integrity ratchet, policy shape,
  and diagram freshness — all five run in CI ahead of the tests.
- This repository's own `project-policy.yml`, evaluated against the example records on every run.

### Coverage at release — and why 46/50 is not a defect

46 of 50 rules have a detector; 16 of 18 standards are fully machine-represented. The four
unevaluated rules are `calibration.no-lookahead-evaluation`, `calibration.no-outcome-vindication`,
`calibration.no-outcome-condemnation`, and `integrity.no-manipulation`. All four report
`not-evaluated` until attested, never as passes.

**This is a designed boundary, not unfinished work, and it should not be closed by adding
detectors.** The first three rules concern how people reason about predictions whose outcomes are
known. The record schema deliberately carries no outcome field, so there is no artifact in which the
error could leave a trace — a detector for them would necessarily be checking something other than
the rule it claimed to check. The fourth is partly automated: four specific manipulations are caught
mechanically, and the rest (a reason written to sound better than it is, evidence quietly overstated)
leave no mechanical trace at all.

Some prediction-quality questions require evidence beyond what an individual prediction record can
establish. A truthful `not-evaluated` is worth substantially more than fabricated automated
assurance, and closing this gap for the sake of a round number would be the exact failure
[Standard 18](standards/18-standards-integrity.md) R4 exists to prevent — a system reporting that it
checked something it did not.

Future rules should come from real adoption exposing a missing rule, a false positive, a false
negative, or a badly calibrated threshold — not from speculative expansion of the catalog.
