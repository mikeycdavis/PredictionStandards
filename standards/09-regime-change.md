# Standard 9 — Regime Change

A model can be correctly specified, well fitted, and faithfully implemented while the world it
learned from has stopped existing. Nothing inside the model reports this.

Source: item 9 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to every record. This is one of the clearest places where prediction quality and model
quality come apart: every diagnostic a model produces about itself — fit, cross-validated error,
calibration on historical data — is computed against the regime it was trained on, and all of them
continue to look excellent after that regime ends. The assessment has to come from outside the model
or not at all. See [`docs/ml-vs-prediction-boundary.md`](../docs/ml-vs-prediction-boundary.md).

## Requirements

### R1 — Assess whether the regime still holds

Every record MUST state whether the conditions the method was built for still obtain
([`regime.change-assessed`](../rules/regime.json)).

A regime change is a shift in the process generating the data, as distinct from an unusual draw from
an unchanged process. Rule changes, structural breaks, a new entrant, a policy shift, a change in how
a metric is measured, an intervention that alters the behaviour being predicted.

`assessed: false` is an admission that nobody looked. It is preferable to an unexamined
`changeDetected: false`, which reads as though somebody had.

### R2 — Account for a detected change

Where a regime change was detected, the record MUST state how the prediction accounts for it
([`regime.change-accounted`](../rules/regime.json)).

Noticing the shift and then predicting as though it had not happened is worse than not noticing,
because the record now documents that the problem was seen and set aside. The available responses:
restrict the sample to the current regime, reweight older observations downward, widen the interval,
lower the confidence tier, or abstain citing `regime-change`.

The first of these has a cost worth naming: cutting the sample to the post-change period usually
makes it small, which runs into [Standard 7](07-sample-size-sufficiency.md). That tension is real and
has no clean resolution — it is frequently the honest reason to abstain.

### R3 — A regime change invalidates prior calibration

Where a regime change is detected, any calibration measured on data from before it MUST NOT be
presented as current evidence of calibration.

Calibration is a claim that this method's stated probabilities matched outcomes *in some period*. A
structural break ends the period. The measurement remains a true fact about the past and stops being
evidence about the present, and a record that carries a pre-break Brier score alongside a
post-break prediction is offering the reader a guarantee that has quietly expired.

### R4 — Absence of a detected change is weak evidence

A record SHOULD NOT treat `changeDetected: false` as evidence that no regime change occurred.

Regime changes are usually identified in retrospect. The methods that detect them reliably need data
from after the break, which is exactly what a live prediction does not have, so a negative finding
means "no break was visible from here" rather than "the regime is stable". Confidence definitions
should not lean on it.

## Prohibitions

None of the source's must-never rules attach to this standard directly. The nearest is
`use stale information without accounting for staleness`
([Standard 5](05-data-freshness.md)), and the relationship is worth stating: staleness is a matter of
degree that a window can express, while a regime change is a discontinuity that makes data from
before it wrong in kind rather than merely old. A freshness window will not catch it.

## Additions this standard makes beyond the source

- R1's definition of a regime change and its enumeration of forms. The source names `regime change`
  as a required standard without characterising one.
- R2's list of responses, and the observation that the most obvious response conflicts with
  [Standard 7](07-sample-size-sufficiency.md).
- R3 in full — the interaction with calibration. The source treats calibration and regime change as
  separate items and does not connect them.
- R4 in full, including the asymmetry that makes a negative finding weak evidence.
- The framing in Scope of regime change as the clearest case where a sound model produces an
  unsupported prediction. The source asserts that boundary generally; applying it here is this pack's
  reading.

## Relationship to other standards

[Standard 3](03-calibration.md) is what R3 acts on: a calibration claim carries an `asOf` date
precisely so a reader can ask whether it predates a break.

[Standard 5](05-data-freshness.md) handles the continuous version of the same worry, and cannot
substitute for this one.

[Standard 10](10-model-disagreement.md) often provides the first observable symptom: models that
agreed for months and now diverge are frequently reacting to a structural change at different rates,
so an unexplained rise in spread is worth reading as a regime signal rather than as noise.

[Standard 17](17-abstention.md) supplies `regime-change` as a coded abstention reason, which R2 names
as a legitimate response.

## Implementation

Implemented by two rules in [`rules/regime.json`](../rules/regime.json), evaluated by
`scripts/records.mjs`.

Both carry `partial` assurance, and the limit is fundamental rather than incidental: the evaluator
can see that an assessment was claimed and that a detected change was said to be handled. It has no
way to detect a regime change the assessor missed, which is the case that matters and the case that
occurs. A record asserting `assessed: true, changeDetected: false` in the middle of a structural
break passes both rules cleanly.

This is not a gap to be closed by a better check. Detecting regime change from within a single
prediction record is not possible in principle — it requires data the record does not contain and
usually does not yet exist.

**R3 and R4 have no rules.** R3 would require the evaluator to compare a calibration date against a
regime-change date the record does not carry; adding such a field was considered and rejected, since
the date of a structural break is itself usually a contested estimate rather than a fact a record can
assert. R4 concerns how a reader should weigh a negative finding and is not a property of the record
at all.
