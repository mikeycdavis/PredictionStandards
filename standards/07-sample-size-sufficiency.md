# Standard 7 — Sample-Size Sufficiency

Below some size, a rate estimate describes its sample rather than the world. The number that comes
out looks exactly like one that does not.

Source: item 7 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Requirements

### R1 — State the sample

Every record MUST state how many observations support the prediction, what each observation is, and
why those are the relevant ones ([`data.sample-size-declared`](../rules/data.json)).

All three parts do work. The count alone is uninterpretable — 500 minutes and 500 seasons are not
comparable evidence, and the unit is what tells them apart. The basis matters most of the three and
is the easiest to leave vague: it says *which* observations these are and why they bear on this
question. "Last 500 matches" and "last 500 matches at this venue in comparable conditions" are
different samples with different claims attached.

### R2 — Meet the project's minimum, or justify the shortfall

The sample MUST meet the project's declared minimum, or the record MUST explain why a smaller one
suffices here ([`data.sample-size-sufficient`](../rules/data.json)).

The threshold lives in `parameters.minSampleSize` in project policy, not in this standard. Nothing in
the source fixes a number, and no number would be right across domains: thirty observations is
comfortable for a stable high-frequency process and hopeless for a rare event with a base rate near
one percent.

The justification branch is not a loophole to be discouraged. Small samples are sometimes all that
exists, and a well-reasoned prediction from twelve observations with a wide interval is more useful
than an abstention. What the rule prevents is the small sample passing unremarked, with an interval
that does not reflect it.

### R3 — Sufficiency depends on more than the count

A count checked against a threshold is a crude instrument, and a project SHOULD treat clearing it as
a floor rather than as evidence of adequacy.

What actually determines whether a sample is sufficient includes: the base rate of the outcome (rare
events need far more observations to estimate at all), the effect size being detected, and whether
the observations are independent. Two hundred correlated observations from a single season can carry
less information than twenty independent ones.

The last of these is the most common trap. Sample size counts rows; independence is a property of how
those rows were generated, and the record has no field that could capture it because there is no
general way to express it.

### R4 — The sample governs how precisely the result may be stated

The stated precision of a probability MUST NOT exceed what the sample supports. This is enforced
under [Standard 12](12-false-precision.md) R1, which reads the sample size declared here.

It is stated in this standard as well because the two requirements are usually encountered together
and are easy to satisfy in isolation: a record can declare an honest sample of forty and then quote
its probability to four decimal places, satisfying R1 here while violating Standard 12 outright.

## Prohibitions

None of the source's must-never rules attach to this standard directly. The closely related
`present excessive decimal precision unsupported by the model` belongs to
[Standard 12](12-false-precision.md), which is where the sample declared here is consumed.

## Additions this standard makes beyond the source

- R1's requirement for a unit and a basis alongside the count, and the observation that the basis is
  the part most often left vague. The source names `sample-size sufficiency` without specifying what
  declaring a sample involves.
- R2's placement of the threshold in project policy rather than in the standard, and the explicit
  statement that the justification branch is legitimate.
- R3 in full — base rate, effect size, and independence. The source does not address what sufficiency
  depends on, and this pack's automated check is crude enough that saying so is obligatory.
- R4's cross-reference, which the source does not draw.

## Relationship to other standards

[Standard 12](12-false-precision.md) consumes this standard's output: the false-precision check
compares the stated decimal places against the standard error implied by the sample declared here.
The two standards are a pair, and neither is much use alone.

[Standard 2](02-uncertainty.md) is where an inadequate sample should become visible to a reader — a
small sample produces a wide interval, and the interval is the honest expression of what R2's
threshold gestures at crudely.

[Standard 6](06-missing-information.md) covers the adjacent failure where information is absent rather
than merely scarce, and [Standard 4](04-baseline-probability.md) R2 applies this standard's reasoning
to the baseline: a base rate drawn from eleven historical cases is a weak reference.

[Standard 17](17-abstention.md) provides `sample-too-small` as a coded abstention reason, and
[`abstention.no-manufactured-prediction`](../rules/abstention.json) treats an unjustified shortfall as
one of the four conditions under which no prediction should have been issued.

## Implementation

Implemented by two rules in [`rules/data.json`](../rules/data.json), evaluated by
`scripts/records.mjs`.

`data.sample-size-declared` carries `full` assurance: the three fields are present or they are not.

`data.sample-size-sufficient` carries `partial`, and its assurance note states the limit directly —
it compares a count against a policy threshold, while sufficiency actually depends on the base rate,
the effect size, and the independence of the observations, none of which a count captures. A record
that passes has cleared a crude bar, not been shown to have enough evidence.

**R3 has no rule and could not have one.** Independence in particular is not expressible in the
record schema: there is no general representation of how observations were generated, and a boolean
`independent: true` field would be answered optimistically and mean nothing. R4 is implemented under
[Standard 12](12-false-precision.md) rather than duplicated here, so that one check reads one sample
declaration and there is no second definition to drift.
