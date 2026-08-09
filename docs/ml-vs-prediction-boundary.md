# The boundary between ML model quality and prediction quality

This pack governs whether an individual prediction is sufficiently supported. It does not evaluate
models. The two are separate concerns, and the domain brief states why, reproduced verbatim from the
source:

> A valid ML model can still produce a poor or unjustified prediction.

The converse also holds and is worth stating: a mediocre model can produce a well-supported output,
including a well-supported abstention. Model quality and prediction quality are not two measurements
of the same thing.

## What each governs

| | ML model quality | Prediction quality (this pack) |
|---|---|---|
| **Subject** | a model | a single output |
| **Question** | is this model well built? | is *this* output justified by what was available? |
| **Evidence** | training data, architecture, hyperparameters, offline metrics, validation protocol | the record: probability, interval, baseline, freshness, completeness, ensemble, market |
| **Timescale** | changes when the model is retrained | changes with every prediction |
| **Typical artifacts** | model cards, experiment tracking, evaluation suites | prediction records |
| **Verdict** | not produced here | `SUPPORTED`, `INSUFFICIENTLY_SUPPORTED`, `BLOCKED_BY_INVARIANT`, `NOT_EVALUATED` |

**Nothing in this pack evaluates the left-hand column.** No rule inspects training data, architecture,
feature engineering, or offline performance. A record from a model that has never been validated can
reach `SUPPORTED` — it will simply carry `calibration.measured: false` and, under an honest confidence
vocabulary, a low tier.

That is not a gap. It is the boundary. Model quality is the subject of a machine-learning standards
pack, and merging the two would produce a verdict that cannot be read: a failure would mean either
"this model is badly built" or "this particular output is unjustified", and those call for entirely
different responses.

## The interface: claims here, truth elsewhere

Three record fields *reference* model-level facts without evaluating them:

| Field | What it claims | What this pack does |
|---|---|---|
| `calibration` | this method's probabilities were measured against outcomes | checks that a claim carries a described measurement; cannot confirm it happened |
| `ensemble.members[].version` | which model versions produced which numbers | checks presence; does not evaluate any member |
| `methodology.version` | which method ran | checks presence and declared changes; does not assess the method |

The pattern is the same in all three: **the record carries a claim, and the truth of that claim lives
outside this pack.** Where the claim is consequential — calibration especially — the rule is
`attestable`, so a human can record that they verified it, and until they do the rule reports
`not-evaluated` rather than passing.

This is the honest shape of the boundary. A prediction pack must be able to *refer* to model-level
properties, because a prediction resting on a calibrated model is better supported than one resting
on an unvalidated one. What it must not do is pretend to have checked them.

## Two worked cases

### A well-validated model producing an unsupported prediction

A demand-forecasting model with a measured Brier score of 0.11 on a year of out-of-sample data,
excellent cross-validation, and a clean architecture review. It emits a prediction where:

- `data.freshness.dataAsOf` is nineteen days old against a seven-day window, with no
  `stalenessAccounted`;
- `regime.changeDetected` is `true` (a competitor exited the market last week) with no
  `accountedFor`;
- `data.completeness.criticalMissing` lists the competitor's replacement pricing, with no
  justification.

Verdict: `INSUFFICIENTLY_SUPPORTED`, failing `data.staleness-accounted`, `regime.change-accounted`,
`data.missing-critical-blocks`, and `abstention.no-manufactured-prediction`.

Every model-quality signal is excellent. None of them is evidence about *this* output, because all of
them were measured under conditions that no longer hold — which is
[Standard 9](../standards/09-regime-change.md)'s central point: a model's own diagnostics are computed
against the regime it was trained on, and they keep looking excellent after that regime ends.

### A mediocre model producing a supported abstention

An unvalidated heuristic, never calibrated, no ensemble, thin training data. Asked about an event
with no comparable history, it emits an abstention: the fixed statement, reasons
`sample-too-small` and `missing-critical-information`, complete provenance, honest
`calibration.measured: false`.

Verdict: `SUPPORTED`. The prediction-only rules are reported `not-applicable` with reasons; the
abstention rules pass; nothing is claimed that is not established.

The model is poor. The output is exemplary — it says precisely what is and is not known, and a
consumer can act on it correctly by not acting.

## Non-goals

This pack does not:

- evaluate or compare models, or recommend one over another;
- assess training data quality, feature engineering, or architecture;
- compute or verify offline metrics;
- perform calibration measurement (it checks whether a *claim* to have measured is well-formed);
- assess whether a model should be deployed;
- recommend acting on a prediction. A `SUPPORTED` verdict means the output is justified by its stated
  evidence, not that a decision follows from it — see
  [Standard 14](../standards/14-edge-calculation.md) R6.

## Where the boundary is drawn in the tooling

Concretely: every rule in `rules/` takes a prediction record as its subject. There is no rule whose
subject is a model, a dataset, or a training run, and `assertBindings` in `scripts/catalog.mjs`
prevents the evaluator from reporting against any id the catalog does not define — so a
model-evaluating detector could not be added without first adding a model-evaluating rule, which
would be a visible change to the pack's scope rather than a quiet expansion of it.

The one exception proves the rule: [Standard 18](../standards/18-standards-integrity.md)'s subject is
the standards system itself. That is deliberate and documented, not a drift in scope.
