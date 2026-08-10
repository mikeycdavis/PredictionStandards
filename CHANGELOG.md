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

## [1.1.0] — 2026-08-09

Standards version 1.1.0, report schema 1.0, **record schema 1.1.0**.

The adoption release. Three deliberately different projects were run against the frozen 1.0.0
baseline without changing it, and the
[v1.1 evidence review](artifacts/release-review/v1.1-evidence-review.md) dispositioned all nineteen
findings before any code was written. Every change below traces to a disposition in
[`artifacts/release-review/v1.1-evidence-review.md`](artifacts/release-review/v1.1-evidence-review.md),
which is the decision record for this release. No change originates outside candidates C1–C10.

### Added

- **C2 — Standard 19, Outcome Falsifiability.** A prediction whose outcome was already determined
  when it was generated cannot be wrong, and Adoptions #2 and #3 independently produced records that
  satisfied every rule in the pack while being exactly that. Two rules in `rules/falsifiability.json`,
  split along the assurance boundary the evidence established:
  - `falsifiability.declared` — structural, `partial` assurance. The record declares
    `subject.falsifiability.undeterminedAtGeneration` with a basis. Establishes that the declaration
    was **made**, never that it is true.
  - `falsifiability.resolution-not-self-determined` — `manual-review`, `none` assurance, attestable.
    The property itself. No detector implements it and none is planned.

  **The standard also forbids its own most tempting simplification.** R3 states that independence and
  externality must not be required in place of falsifiability: Adoption #3 produced a legitimate
  forecast resolved by the same system running the same method on the same data, and a rule demanding
  an independent resolver would reject it. The five structures that establish this are permanent
  regression fixtures in `test/fixtures/records/falsifiability/`, with `test/falsifiability.test.mjs`
  asserting each disposition.

- **Record schema 1.1.0**, adding the optional `subject.falsifiability` block. Additive: every 1.0.0
  record remains valid and readable, and no verdict changes for an unmodified corpus. A 1.0.0 record
  reports `not-evaluated` for `falsifiability.declared` — never `passed` and never `not-applicable`
  ([ADR 0008](artifacts/adr/0008-record-schema-evolution-and-the-legacy-disposition.md)).

- **A per-record `not-evaluated` disposition** in the verdict engine, alongside the per-record
  `not-applicable` disposition of ADR 0005. *Not applicable* says the rule has no subject here.
  *Not evaluated* says it has one and this run could not reach it. Collapsing them would let a
  compatibility gap be credited as support for a property nothing examined.

- **Evidence-derived standards.** The inventory records `origin: "source"` or `origin: "evidence"`
  per standard, and an evidence-derived standard must name an existing `derivedFrom` artifact.
  Standard 19 is the first, and the only one. `scripts/inventory.mjs` still compares the 18
  source-derived standards positionally and verbatim against the specifications
  ([ADR 0009](artifacts/adr/0009-evidence-derived-standards.md)).

### Changed

- **Framework coverage went down, deliberately.** 1.0.0 evaluated 46 of 50 rules; 1.1.0 evaluates
  **47 of 52**. Standard 19 added a property three adoptions proved real and one adoption proved
  unautomatable, so one of its rules reports `not-evaluated` until attested. This is not a
  regression. A pack that only ever adopted rules it could check would be choosing its standards by
  what is easy to detect, and the 46/50 principle — a truthful `not-evaluated` beats fabricated
  assurance — cuts this way as readily as the other.

- **C3 — expected value is compared in currency space.** A new `parameters.currencyTolerance`
  (default `0.005`) governs `ev.recomputable`; `parameters.tolerance` stays at `0.0001` and now
  governs probability space only. Adoption #1 found one number serving both, so an expected value
  rounded to the cent — the correct thing for an adopter to publish — failed permanently against an
  exact recompute. The tempting fix was to widen the shared tolerance, which would have loosened
  `edge.recomputable`, whose strictness is what makes a fabricated edge detectable.

- **C4 — a stated `market.vig.overround` is verified against the quoted prices.** The value was
  already being recomputed to decide whether removal was required; only the comparison was missing,
  so a record could state any margin beside prices that implied another. Reported against
  `market.vig-removed`. Adoption #1 (A2).

- **C5 — freshness is reconciled against the record's own provenance.** A record that dates its data
  later than every source in `provenance.dataSources` claims a freshness its provenance does not
  support; reported against `data.staleness-accounted`, whose subject that is. The comparison is
  against the most recent source, so older reference data alongside current observation data is not a
  contradiction.

  **Scope, stated because it is easy to overstate:** this closes one evasion, not the
  under-declaration boundary. An empty `criticalMissing` and an omitted `ensemble` have no
  independent referent inside the artifact, and nothing in this release reaches them.

- **C6 — the disagreement threshold names its statistic.** `parameters.disagreementThreshold` is a
  threshold on max-minus-min spread, and the schema now says so. Adoption #1 (A3) transcribed a
  std-dev threshold of 0.08 into a field expecting a spread, which for two members loosens the gate
  by roughly a factor of two, silently. The statistic is deliberately not configurable: max-minus-min
  is the one a two-way split cannot hide behind, and letting a project select another would sanction
  choosing the measure that hides its own split.

- **C7 — `minSampleSize: 30` is documented as arbitrary.** The value is unchanged. The schema now
  states that no source stands behind it and that it must be set per domain; Adoption #2 found it
  colliding with a domain-natural 28, and the override mechanism worked exactly as designed. The
  default was not lowered, because transplanting one adopter's domain constant into every other
  domain is the same error in the other direction.

- **C8 — the pack's position on decision rules is stated.** Standard 14 R6 now says plainly that a
  project's threshold for acting is a policy downstream of the support question and outside this
  pack's authority. Adoption #1 read R6 as disapproving of its own betting gate; it does not.

- **C9 — the verdict boundary is documented.** `INSUFFICIENTLY_SUPPORTED` covers evidence that is
  missing or malformed. Insufficiency that is *the reason not to predict at all* violates
  `abstention.no-manufactured-prediction`, which is non-exemptible, so it escalates to
  `BLOCKED_BY_INVARIANT`. Correct by design, and surprising until written down.

- **C10 — legitimate coexistence of numeric and categorical confidence.** Standard 16 now says that
  an internal numeric evidence-quality measure may sit alongside a published categorical tier. All
  three adopters built exactly that, independently. `confidence.not-probability` governs which
  representation is published, not whether both may exist, and a non-exemptible prohibition read as
  banning the pair would cost adopters a useful measure for nothing.

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
