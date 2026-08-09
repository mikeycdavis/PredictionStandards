# Adoption #2 — BurnoutPredictor

**Adopter:** `F:\Repos\BurnoutPredictor` — privacy-conscious wellness and workload-awareness app.
Produces an explainable 0–100 burnout-risk score from sleep, meetings, work hours, exercise, and
mood, judged against the user's own rolling 28-day personal baseline.
**Standards version:** 1.0.0 (`release/v1.0.0`, unmodified throughout).
**Branched from:** `release/v1.0.0` directly, **not** from `adoption/01-moneyball`, so the two runs
are independent and "reproduced across adopters" means something.
**Method:** `init → explain → records → audit → check`. **BurnoutPredictor's working tree was not
touched.**

Chosen to stress the pack where Moneyball could not: **no market, no edge, no expected value, no
vig**, consequences of an unsupported prediction that are personal rather than financial, and no
external reference to anchor against.

---

## The four-record experiment

| Record | Result | What it demonstrates |
|---|---|---|
| **A** — the 0–100 score called a probability | `SUPPORTED` / 100% | **A category error passes at full marks.** The pack cannot tell a score from a probability. |
| **B** — honest reframe to a resolvable proxy event | `SUPPORTED` / 100% | The architecture *does* generalise once the quantity is genuinely a probability of something falsifiable. |
| **C** — what the engine actually emits on day 5 | `BLOCKED_BY_INVARIANT` / 89% | Predicting on 5 days with 4 of 5 dimensions dead is caught, and caught hard. |
| **D** — the abstention the engine cannot emit | `SUPPORTED` / 100% | Abstention is reachable and scores identically to a well-evidenced prediction. |

C → D is the progression the pack claims: the same evidence, honestly declared, moves from *blocked*
to *supported* by changing the **output**, not the evidence. Nothing was added to D to make it pass —
`expiresAt` and `confidence` were removed, and the reasons cite the same three inadequacies C
declared.

Records preserved under `records/`.

---

## Part 1 — The headline: a self-resolving score passes at 100%

Record **A** maps `RiskAssessment.overallScore` (0–100) to `output.probability` by dividing by 100.
It reaches **`SUPPORTED` (100%)**. Its `outcomeDefinition` is circular —

> "The user's burnout risk, expressed on the 0-100 scale as a proportion."

— and its `resolutionSource` is **the model's own output**:

> "BurnoutPredictor RiskAssessment.overallScore"

Nothing in the pack detects any of this. The number is not a probability of anything; the "outcome"
is the model's own arithmetic; the claim can never be falsified by any observation.

**Mechanism.** Standard 1 R1 requires a `resolutionSource`. It does not require that source to be
**independent of the predictor**. A model naming itself as its own resolver satisfies the rule as
written, and `probability.definition-complete` carries assurance `partial` with a note saying it
cannot establish that an outcome definition is unambiguous — but nothing says it cannot establish
that the definition is *non-circular*.

Adoption #1 could not have exposed this: Moneyball's outcomes resolve against real game results, so
independence was never tested.

**This is a distinct failure class from the Adoption #1 under-declaration finding.** That one was
*omitting* evidence. This one is *mis-typing the quantity* — every field is present and internally
consistent, and the whole record is about something that is not a prediction.

---

## Part 2 — The N/A audit

Requested protocol: for every rule that disappears, ask separately whether the rule is **genuinely
not applicable**, and whether the pack **knows enough to truthfully explain why**. The answers
diverge by family, and the divergence is the finding.

| Family | Genuinely N/A? | Explanation truthful? | Reason given |
|---|---|---|---|
| `market.*` | **Yes** | **Yes** | Quotes the record's own declaration: *"No market, exchange, or external reference expectation exists… Nothing prices this outcome."* |
| `edge.*` | **Yes** | **Yes** | Same declaration, plus *"This record states no edge."* |
| `ev.*` | **Yes** | **Weakly** | *"This record states no expected value."* — a fact about the record, not a claim about the world. Honest, but see below. |
| `ensemble.*` | **Yes** | **No** | *"This record names no ensemble; a single method produced the prediction."* — **the clause after the semicolon is false.** |

### The market family is the pack working correctly

Worth stating plainly because it is the good result. Record A initially **failed**
`market.reference-present-or-declared-absent` and could not pass until it explicitly declared the
absence with a reason. **Absence of a field was not accepted as absence of the concept** — the
adopter had to say "nothing prices this outcome", and the evaluator then quoted that back. This is
exactly the behaviour the protocol asked me to look for, and it held.

### The ensemble family reproduces the Adoption #1 defect, more clearly

BurnoutPredictor's engine computes **five subscores** — sleep (0.25), workload (0.25), meetings
(0.20), mood (0.20), exercise (0.10) — and combines them with a **weighted average, renormalized over
whichever dimensions have data**:

```ts
let raw = weightSum > 0 ? weighted / weightSum : 0;
```

The record declares no `ensemble` block, so the evaluator reports all four ensemble rules
`not-applicable` and asserts *"a single method produced the prediction."* **A single method did not
produce it.** Five scoring functions did, under a renormalizing weighted aggregation.

This is F2 from Adoption #1, **reproduced in a structurally unrelated adopter**, and here the false
clause is flatly contradicted by the source code rather than merely unsupported.

### But the disposition is right, and that distinction matters

The rules are **genuinely not applicable**, for a reason the pack never states. Standard 11's
ensemble is *multiple models estimating the same quantity*. BurnoutPredictor's five subscores are
*different dimensions of one composite index* — sleep score and mood score are not two estimates of
one thing, so there is no meaningful "spread" between them and
`ensemble.disagreement-declared` would be measuring nothing.

So: **the disposition is correct and the explanation is wrong.** That is the precise shape of the
defect, and it is narrower than "the ensemble rules should have fired". The fix is to stop asserting
a fact the record does not support — not to make these rules apply.

### A real gap hiding behind the correct disposition

Standard 10's concern *does* exist here in another form. A user with sleep at 90 and mood at 20
produces a weighted average near the middle, and the composite hides the split — the same
`0.55 and 0.95 average to 0.75` failure Std 10 opens with. The pack has **no vocabulary for
disagreement among heterogeneous components of a composite index**, only among homogeneous estimates
of one quantity. Nothing here is wrong; something is missing, and it is only visible from a
non-market adopter.

### `ev.*` inconsistency

`market.*` absence **must be declared**; `ev.*` and `edge.*` absence may simply be omitted. Three
concepts of the same kind get two different treatments, and the weaker one cannot distinguish "an
expected value is meaningless for a wellness score" from "we forgot to compute it". Minor, but it is
an inconsistency in how the pack demands declarations.

---

## Part 3 — Where BurnoutPredictor and the standards independently agree

### Confidence derived from evidence, not from extremity — a strong convergence

`src/risk-engine/confidence.ts` computes confidence from four inputs:

```ts
weightTrackedDays     * min(trackedDays / 28, 1)      // sample size
weightCompleteness    * meanCompleteness7             // data completeness
weightActiveCategories* (activeDimensions / 5)        // coverage
weightBaselineStability * (baselinesPresent / 5)      // baseline availability
```

Standard 16 R3 says a good confidence vocabulary "refers to the evidence the other standards
require: interval width, sample size, measured calibration, disagreement, completeness." **This is
that, built independently.** It is a closer match to R3 than the example vocabulary shipped in this
repository's own policy.

It also satisfies Standard 16 R5 — confidence does **not** track the score's distance from the
midpoint. A high score with thin data gets low confidence, which is the behaviour R5 asks for and
which many systems get wrong.

### Categorical *and* numeric confidence — reproduced from Adoption #1

`RiskAssessment` stores both `confidence Float // 0..1` and `confidenceLabel String //
"low"|"moderate"|"high"`. Moneyball stored both `Confidence DECIMAL(5,4)` and `ConfidenceRating`.

**Two structurally unrelated projects independently built the same dual representation**, and in both
cases the categorical field is the one the pack accepts. The numeric one is `0..1` here — visually
indistinguishable from a probability, sitting in the same record as a risk score, which is precisely
the conflation `confidence.not-probability` (non-exemptible) exists to prevent.

### Per-dimension insufficiency is already first-class

```ts
/** Result of one dimension's scoring. `score` is null when data is insufficient. */
```

`null` means "not enough data", distinct from a low score. `computeMetricBaseline` returns `null`
below `MIN_BASELINE_DAYS`. **The abstention concept exists inside the engine** — it simply does not
survive aggregation.

---

## Part 4 — Disagreements

### D1 — The engine cannot abstain, and the concept is lost at exactly one step

`assess()` always returns a score. Null dimensions are dropped, weights renormalize over what
remains, and a user with one active dimension out of five still receives a 0–100 overall risk score.
Confidence degrades; the output never does.

So the engine holds "insufficient" per dimension and discards it at the composite. Record C is what
that produces, and it is `BLOCKED_BY_INVARIANT`.

**Reproduced across adopters, by different mechanisms.** Moneyball always emits a probability and
gates *betting* downstream; BurnoutPredictor always emits a score and degrades *confidence*. Neither
can say "no prediction". Two unrelated teams, same structural gap.

**Standard holds.** This is the most valuable thing adoption would give BurnoutPredictor, and the
product already has the UI vocabulary for it — "Learning your baseline" below 14 tracked days is an
abstention in everything but name.

### D2 — The middle state is narrower than expected

The protocol anticipated *supported → insufficiently supported → supported abstention*. Record C came
out **`BLOCKED_BY_INVARIANT`**, not `INSUFFICIENTLY_SUPPORTED`, because
`abstention.no-manufactured-prediction` is non-exemptible.

That is correct by design — manufacturing a prediction on declared-insufficient evidence is a
must-never — but it means `INSUFFICIENTLY_SUPPORTED` covers ordinary rule failures, while
*insufficiency that is the reason you should not have predicted* escalates straight past it. Worth
documenting; not obviously worth changing.

### D3 — `minSampleSize: 30` collides with a domain-natural 28

The engine's `fullTrackedDays` is **28**. The pack's default is **30**. A fully-baselined
BurnoutPredictor user with a complete 28-day window fails `data.sample-size-sufficient` on a default
with no source behind it.

Policy-fixable in one line, and that is the mechanism working as designed. Recorded because it is
direct evidence that **30 is arbitrary**, and the first adopter to meet it needed a different number.

### D4 — Calibration can never be measured here

`calibration.measured: false` is permanently correct for the burnout score: there is no ground truth
for "burnout occurred", and the product explicitly disclaims being diagnostic. Under record B's
reframe calibration becomes measurable in principle, because the proxy event resolves from check-in
data.

**No disagreement — the pack handles this correctly.** `measured: false` is a respectable answer and
`calibration.claim-requires-measurement` never fires. Noted because a domain where calibration is
*unobtainable in principle* is a case the pack was never explicitly designed for, and it degrades
gracefully.

---

## Part 5 — Findings about PredictionStandards v1.0.0

**Nothing fixed. Evidence only.** Classes as in Adoption #1.

### 5A — Observed framework defects

| # | Finding | Status vs Adoption #1 |
|---|---|---|
| **G1** | A `resolutionSource` may name the predictor's own output. Self-resolution passes, and an unfalsifiable claim reaches `SUPPORTED` at 100%. | **Newly exposed** |
| **G2** | The ensemble N/A reason asserts *"a single method produced the prediction"* from a missing field. Here it is contradicted by five weighted subscores in the source. | **Reproduced** (= F2) |
| **G3** | `market.*` absence must be declared; `edge.*` and `ev.*` absence may be silently omitted. Same class of concept, two standards of evidence. | **Newly exposed** |
| **G4** | No vocabulary for disagreement among heterogeneous components of a composite index — only among homogeneous estimates of one quantity. | **Newly exposed** (gap, not defect) |

**F1 from Adoption #1 did not reproduce**, because BurnoutPredictor has no expected value to round.
This is exactly the discrimination the two-adopter design was meant to provide: F1 is a real defect,
but it is confined to the money-bearing path.

### 5B — The under-declaration vulnerability, revisited

Adoption #1 established that a producer can under-declare and still pass. Adoption #2 shows the
**adjacent** failure: a producer can declare *everything*, consistently and completely, and still be
describing something that is not a prediction.

These are different. Under-declaration is a **completeness** failure — facts withheld.
Self-resolution is a **validity** failure — every fact present, the whole artifact mis-typed. No
completeness mechanism (provenance reconciliation, independent evidence, disclosure standards)
touches G1, because record A withheld nothing.

Any future work should not assume one class of mitigation addresses both.

---

## Recommendation

**Leave v1.0.0 frozen.** Two adoptions have produced one reproduced defect (G2/F2), three newly
exposed findings, one confirmed adopter-specific defect (F1), and two boundaries. That is enough to
begin a synthesis and not enough to justify unfreezing.

The strongest single candidate for v1.1 is **G2/F2** — it is the only finding independently exposed
by both adopters, it is a case of the framework violating its own evidence-honesty principle, and the
fix is to delete an unsupported clause rather than to add a detector.

**G1 deserves the most thought and the least haste.** Requiring a resolution source independent of
the predictor is easy to state and hard to check, and a naive check would reject legitimate
self-reported outcomes — record B resolves against user-entered check-ins, which are "internal" to
the product but genuinely independent of the risk engine. The distinction is between *the predictor*
and *the product*, and it is not obviously machine-checkable.

---

## Provenance of this report

Produced against PredictionStandards `999c34d` (`release/v1.0.0`) with **no modification to any
standard, rule, threshold, detector, schema, or v1.0 artifact**. BurnoutPredictor's working tree was
not modified. All results reproduce with `--as-of` pinned:

```bash
predictions check artifacts/adoption/02-records/B-honest-proxy-prediction.json \
  --policy=artifacts/adoption/02-project-policy.yml --as-of=2026-06-14T08:00:00Z
predictions check artifacts/adoption/02-records/C-low-data-as-built.json \
  --policy=artifacts/adoption/02-project-policy.yml --as-of=2026-06-05T08:00:00Z
```
