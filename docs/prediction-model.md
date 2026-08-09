# The prediction model

The domain brief opens by naming twelve things to evaluate about a prediction, and then insists on a
distinction between four quantities that are routinely confused. This document maps both onto the
record schema and the standards.

## The four quantities

The brief is explicit, reproduced verbatim from the source:

```text
Explicitly distinguish probability, confidence, edge, and expected value.
```

These are four different things with four different units, four different decision rules, and four
separate fields in the record. Confusing any two of them is a prohibition.

| | Answers | Units | Record field | Example |
|---|---|---|---|---|
| **Probability** | How likely is the event? | number in [0, 1] | `output.probability` | `0.62` |
| **Confidence** | How much weight does the evidence bear? | categorical tier | `confidence.tier` | `moderate` |
| **Edge** | How far is this from the market? | signed difference of probabilities | `edge.value` | `+0.04` |
| **Expected value** | What is this wager worth? | currency | `expectedValue.value` | `12.40 USD` |

### Why these are kept structurally apart

The separation is enforced by the schema rather than by instruction, so conflating them is a
validation error rather than a lapse of memory:

- `output.probability` is bounded to [0, 1] and its block admits nothing monetary.
- `confidence.tier` is a string that must appear in a declared vocabulary, and a tier that is merely
  a number wearing a label is rejected.
- `edge.value` requires a `market` block to measure against, and is recomputed from the two
  probabilities.
- `expectedValue` requires `stake`, `payout`, and `currency`, and is recomputed from all three plus
  the probability.

No field can play two roles. A record cannot express "62% confident" in a way that leaves it
ambiguous whether that is a probability or a confidence, because the two live in different fields
with different types.

### What each confusion costs

| Confusion | Consequence |
|---|---|
| probability read as expected value | a high-probability outcome at a terrible price looks like a good bet |
| confidence read as probability | "high confidence" in an unlikely event is read as the event being likely |
| edge read as probability | a `+0.04` edge is read as a 4% chance |
| edge read as expected value | a small edge on a large stake and a large edge on a small one look identical |
| pre-vig edge read as edge | almost every outcome shows positive edge; the strategy loses at the rate of the margin |

The last is the subtlest and is covered by [Standard 15](../standards/15-vig-removal.md).

### A worked example

The same prediction, stated four ways:

- **Probability** `0.62` — the event is somewhat more likely than not.
- **Confidence** `moderate` — the interval is 0.55–0.70, three independent sources, no regime change
  detected, but calibration has not been measured.
- **Edge** `+0.04` — the de-vigged market implies 0.58, so this prediction is four points above it.
- **Expected value** `+12.40 USD` — on a 100 USD stake at a 172 USD payout,
  `0.62 × 72 − 0.38 × 100 = 6.64`… which does *not* equal 12.40, and that is exactly the kind of
  arithmetic error `ev.recomputable` exists to catch.

The correct expected value for those numbers is `+6.64 USD`. It is left wrong above deliberately: the
figure looks entirely plausible, and no reader spots it by eye. That is the argument for recomputing
rather than trusting.

---

## The twelve factors

The brief lists twelve things to evaluate, reproduced verbatim from the source:

```text
predicted probability
baseline/reference probability
uncertainty
calibration
sample size
data completeness
data freshness
model agreement/disagreement
regime/context changes
market/reference expectations
edge
confidence tier
```

Each maps to a field in the record schema and to at least one standard.

| Factor | Record field | Standard | Notes |
|---|---|---|---|
| predicted probability | `output.probability` | [1](../standards/01-probability-definition.md) | must be resolvable against a defined outcome |
| baseline/reference probability | `baseline` | [4](../standards/04-baseline-probability.md) | or a declared absence with a reason |
| uncertainty | `output.interval` | [2](../standards/02-uncertainty.md) | bounds plus the level they are stated at |
| calibration | `calibration` | [3](../standards/03-calibration.md) | a claim requires a measurement |
| sample size | `data.sampleSize` | [7](../standards/07-sample-size-sufficiency.md) | count, unit, and basis |
| data completeness | `data.completeness` | [6](../standards/06-missing-information.md) | known gaps vs critical absences |
| data freshness | `data.freshness` | [5](../standards/05-data-freshness.md) | when the data was current, not when it was fetched |
| model agreement/disagreement | `ensemble.disagreement` | [10](../standards/10-model-disagreement.md) | spread recomputed from members |
| regime/context changes | `regime` | [9](../standards/09-regime-change.md) | assessed, and accounted for if detected |
| market/reference expectations | `market` | [15](../standards/15-vig-removal.md) | de-vigged before use |
| edge | `edge` | [14](../standards/14-edge-calculation.md) | recomputable from probability and market |
| confidence tier | `confidence.tier` | [16](../standards/16-confidence-definitions.md) | categorical, from a declared vocabulary |

### The six standards not in the twelve

Six standards have no corresponding factor, and the asymmetry is informative. The brief's twelve
factors describe *what a prediction contains*; six of the seventeen required standards describe *how
it must be handled*:

| Standard | Why it has no factor |
|---|---|
| [8 — Outliers](../standards/08-outliers.md) | a property of how the sample was treated, not a value in the record |
| [11 — Ensemble behavior](../standards/11-ensemble-behavior.md) | composition and reporting, upstream of the agreement factor |
| [12 — False precision](../standards/12-false-precision.md) | a constraint on how the probability is written |
| [13 — Prediction expiration](../standards/13-prediction-expiration.md) | a property of the prediction's lifetime |
| [17 — Abstention](../standards/17-abstention.md) | the alternative to having any of these factors at all |
| [18 — Standards integrity](../standards/18-standards-integrity.md) | governs the standards, not the prediction |

### "Where applicable"

The brief qualifies the list, reproduced verbatim from the source:

```text
Where applicable, evaluate:
```

That qualifier is why the record schema makes several of these blocks optional with an explicit
declared-absence branch rather than simply permitting omission. `baseline` and `market` each require
either a value or a stated reason for its absence; `ensemble` is absent when a single model produced
the prediction, and the evaluator reports the ensemble rules `not-applicable` rather than passing
them.

Omission and inapplicability look identical in a record that merely leaves a field out. Requiring the
declaration is what keeps "there is no market for this" distinguishable from "nobody checked".
