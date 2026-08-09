# Standard 3 — Calibration

Calibration is an empirical property, not a quality. It means that among the occasions a method said
70 percent, the outcome happened about 70 percent of the time — and that is a measurement somebody
performed on resolved outcomes, or it is nothing.

Source: item 3 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to every record, and to every claim made *about* records after their outcomes are known. This
standard carries five of the source's nineteen prohibitions — more than any other — because the
reasoning errors around calibration are the ones that most reliably convince a team its prediction
system works when it does not.

Three of those five concern how past predictions are judged rather than how present ones are made.
They are in scope because a prediction pack that governed only generation would leave the loop open:
predictions are made carefully, then evaluated with hindsight, and the evaluation teaches the method
to be worse.

## Requirements

### R1 — A calibration claim requires a measurement

**Never**, reproduced verbatim from the source:

```text
claim calibration that has not been measured
```

A calibration score MAY appear only where `measured` is true, and a measured claim MUST name the
method, the dataset, and when the measurement was performed
([`calibration.claim-requires-measurement`](../rules/calibration.json)).

Saying a model is "well calibrated" without a measurement behind it is the most common unfounded
claim in prediction work, and it is persuasive precisely because it sounds like a technical property
rather than an assertion. `measured: false` is a perfectly respectable answer. It says the method's
probabilities have not been checked against outcomes, which is true of most models most of the time,
and it lets a reader discount accordingly.

The dataset matters as much as the metric. A calibration measured on the data the model was fitted to
is not a calibration; it is a description of the fit.

### R2 — A historical prediction uses no information from after its cutoff

**Never**, reproduced verbatim from the source:

```text
use post-event information in historical predictions
```

Where a record reconstructs a prediction as it would have been made at an earlier time, it MUST
declare an information cutoff, and every data source it draws on MUST be as-of at or before that
cutoff ([`calibration.no-lookahead-generation`](../rules/calibration.json), non-exemptible).

This is how backtests come to promise returns that never materialise. A model given even slightly
post-dated inputs — a revised statistic, a final roster, a corrected figure — is not predicting, it is
remembering, and it will report performance that cannot be reproduced going forward. The leak is
rarely deliberate and almost never obvious in the results, which look merely good.

### R3 — Past predictions are judged on what was available at the time

**Never**, reproduced verbatim from the source:

```text
evaluate historical prediction quality using information unavailable when predictions were generated
```

An assessment of how good a past prediction was MUST use only the information that existed when it
was generated ([`calibration.no-lookahead-evaluation`](../rules/calibration.json), non-exemptible).

R2 governs the prediction; this governs the review of it. The question a review answers is whether
the prediction was justified by what was knowable, not whether it matched what turned out to be true.
Reviewing with hindsight makes every forecaster look careless — the decisive fact is always obvious
afterwards — and the lesson it teaches is to predict the things that are easy to see coming.

### R4 — A correct outcome does not vindicate the process

**Never**, reproduced verbatim from the source:

```text
treat a correct outcome as proof that a prediction process was good
```

No claim about the quality of a prediction process may rest on the fact that a prediction came true
([`calibration.no-outcome-vindication`](../rules/calibration.json)).

A method that assigns 5 percent to the thing that happens is not vindicated by it happening. On a
sample of one, a lucky call and a good one are indistinguishable. Systems that reward correct
outcomes rather than sound process drift toward confident extremes, because those are the calls that
look brilliant when they land — and the drift is invisible until a run of them lands the other way.

### R5 — An incorrect outcome does not condemn the prediction

**Never**, reproduced verbatim from the source:

```text
treat an incorrect outcome as proof that a probabilistic prediction was bad
```

No claim that a probabilistic prediction was wrong may rest on the fact that the predicted outcome
did not occur ([`calibration.no-outcome-condemnation`](../rules/calibration.json)).

This is the mirror of R4 and the more corrosive of the two in practice. A well-calibrated 80 percent
prediction is *supposed* to be wrong one time in five; if it never is, it was not an 80 percent
prediction. Treating each of those as a failure creates pressure to hedge every number toward 0.5,
which is the one distribution guaranteed to be defensible after any outcome and to carry no
information before it.

R4 and R5 are stated separately because they are not felt symmetrically. Teams rarely object to being
credited for a lucky call, and they object strongly to being blamed for an unlucky one, so the two
errors need different arguments even though they are the same mistake.

### R6 — Assess calibration over a sample, using a proper scoring rule

Where calibration is measured, the assessment SHOULD use a proper scoring rule — Brier score,
logarithmic score — over a sample of predictions, rather than counting how many individual calls were
"right". The record schema admits `brier`, `ece`, and `log-loss` for this reason.

A proper scoring rule is one where the forecaster's best strategy is to report their true belief.
Accuracy counting is not proper: it rewards rounding every probability to 0 or 1, which is why
systems scored on hit rate stop producing probabilities and start producing predictions.

## Prohibitions

This standard carries five of the nineteen prohibitions — the largest group. Each is quoted verbatim
at its requirement above.

| Prohibition | Rule | Requirement | Evaluated by | Non-exemptible |
|---|---|---|---|---|
| claim calibration that has not been measured | [`calibration.claim-requires-measurement`](../rules/calibration.json) | [R1](#r1--a-calibration-claim-requires-a-measurement) | structure + attestation | no |
| use post-event information in historical predictions | [`calibration.no-lookahead-generation`](../rules/calibration.json) | [R2](#r2--a-historical-prediction-uses-no-information-from-after-its-cutoff) | structure | yes |
| evaluate historical prediction quality using information unavailable when predictions were generated | [`calibration.no-lookahead-evaluation`](../rules/calibration.json) | [R3](#r3--past-predictions-are-judged-on-what-was-available-at-the-time) | human only | yes |
| treat a correct outcome as proof that a prediction process was good | [`calibration.no-outcome-vindication`](../rules/calibration.json) | [R4](#r4--a-correct-outcome-does-not-vindicate-the-process) | human only | no |
| treat an incorrect outcome as proof that a probabilistic prediction was bad | [`calibration.no-outcome-condemnation`](../rules/calibration.json) | [R5](#r5--an-incorrect-outcome-does-not-condemn-the-prediction) | human only | no |

## Additions this standard makes beyond the source

- R1's requirement that a measured claim name its dataset and date, and the observation that a
  calibration measured in-sample is not a calibration. The source prohibits the unmeasured claim
  without saying what a measured one must contain.
- R6 in full — proper scoring rules, and the argument against accuracy counting. The source does not
  address how calibration should be assessed.
- The reasoning in R5 about hedging toward 0.5, and the observation in R4 about drift toward
  confident extremes. The source states both prohibitions without explaining the failure mode each
  produces.
- The note under R5 that the two outcome-bias errors are not felt symmetrically.
- Assigning R2 and R3 non-exemptible status, and R4 and R5 not. All four are equally wrong; the
  difference is that the first two describe an act that produces a corrupted artifact, while the
  latter two describe a way of reasoning about artifacts. A policy can meaningfully be prevented from
  waiving the first pair. Marking the second pair non-exemptible would have been symbolic, since
  nothing automated evaluates them at all.

## Relationship to other standards

[Standard 16](16-confidence-definitions.md) is where measured calibration usually earns its keep: a
project's high-confidence tier will typically require it, which is what stops the tier from being a
mood. [Standard 1](01-probability-definition.md) R1 supplies the resolvable outcome without which no
calibration measurement is possible.

[Standard 18](18-standards-integrity.md) is closely related in spirit. R1 forbids claiming a property
that was not measured; Standard 18 forbids weakening the rule that would have caught the claim. Both
are about the gap between what a system asserts and what it has established.

[Standard 13](13-prediction-expiration.md) matters for R2: a historical reconstruction that ignores
the expiry of the inputs it reconstructs is a subtler form of the same lookahead.

## Implementation

Implemented by five rules in [`rules/calibration.json`](../rules/calibration.json). The division of
labour between machine and human is unusually stark here, and stating it accurately is more important
than the coverage number.

**R1 and R2 are checked structurally.** The evaluator confirms that a score is accompanied by a
described measurement, and that a historical record's declared sources predate its declared cutoff.
Both carry `partial` assurance: R1's check cannot confirm the measurement happened, only that it was
described, and R2's cannot see information that reached a model through a source the record does not
list — which is the harder and more common form of the leak.

**R3, R4, and R5 are `manual-review` with assurance `none`.** Nothing automated evaluates them, and
they are reported `skipped / not-evaluated` until a human records an attestation in the project
policy. They never pass by default. This is deliberate: all three concern how people reason about
resolved predictions, and the record schema carries no outcome field at all, so there is no artifact
in which the error could leave a trace. A check that pretended otherwise would be the false green
this whole architecture exists to prevent.

This repository's own [`project-policy.yml`](../project-policy.yml) carries attestations for all
three, each stating what was examined — including the honest observation that this repository
performs no retrospective evaluation whatsoever, so the rules are attested against the absence of an
evaluation pipeline rather than against a clean one.

**R6 has no rule.** The scoring metric is constrained by the schema's enum, but whether the
assessment was performed over an adequate sample is not something the record reports.
