# Standard 16 — Confidence Definitions

Confidence is how much weight the evidence bears. Probability is how likely the event is. A model can
be highly confident that something is unlikely, and a system that lets either number stand for the
other produces output nobody can interpret.

Source: item 16 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to predictions. This is the third corner of the four-way separation —
[Standard 1](01-probability-definition.md) R4 holds probability against expected value, and
[Standard 14](14-edge-calculation.md) holds edge and expected value apart. All four are laid out in
[`docs/prediction-model.md`](../docs/prediction-model.md).

## Requirements

### R1 — Confidence is never expressed as, or confused with, the probability

**Never**, reproduced verbatim from the source:

```text
confuse model confidence with event probability
```

The confidence tier MUST be categorical, MUST NOT be a number or a percentage, and MUST occupy its
own field ([`confidence.not-probability`](../rules/confidence.json), non-exemptible).

The two answer different questions:

| | Question | Form | Example |
|---|---|---|---|
| **Probability** | How likely is the event? | number in [0, 1] | 0.15 |
| **Confidence** | How much weight does the evidence bear? | categorical tier | high |

"15 percent, high confidence" is perfectly coherent: the event is unlikely and we have good grounds
for saying so. "15 percent confident" is ambiguous between the two readings and is the phrase this
rule exists to prevent.

The requirement that confidence be categorical is doing specific work. A numeric confidence invites
arithmetic against the probability — multiplying them, comparing them, averaging them — and none of
those operations is meaningful. The record schema enforces this by rejecting tiers that are merely
numbers wearing a label.

**A numeric measure and a categorical tier may legitimately coexist.** All three adopters of this
pack independently stored both: an internal numeric evidence-quality score and a categorical label
published beside the prediction. That is not a violation, and the prohibition is not about
coexistence. It governs *interpretation* — which representation is published as confidence, and
whether anything invites a reader to read it as a probability. Keep the numeric measure if it is
useful; publish the tier. What is forbidden is putting a bare `0..1` number in
`confidence.tier`, where it sits beside `output.probability` and is visually indistinguishable
from it.

### R2 — Tiers are defined before they are used

A vocabulary of tiers, each with a definition, MUST be available in the project policy or inline in
the record ([`confidence.definitions-declared`](../rules/confidence.json)), and the tier a record
states MUST come from it ([`confidence.tier-from-vocabulary`](../rules/confidence.json)).

Undefined tiers are adjectives. Two people reading "moderate confidence" will act differently unless
the word is pinned to conditions they could check.

### R3 — A definition must be checkable

A tier's definition SHOULD state conditions someone could disagree with.

"Fairly sure" is not a definition. "Interval width below 0.10, calibration measured out-of-sample
within the last year, ensemble spread within the project threshold, and no critical information
missing" is — someone can hold a record against it and say it does not qualify.

This is where confidence stops being a mood and starts summarising the rest of the record. A good
vocabulary refers to the evidence the other standards require: interval width
([Standard 2](02-uncertainty.md)), sample size ([Standard 7](07-sample-size-sufficiency.md)), measured
calibration ([Standard 3](03-calibration.md)), disagreement
([Standard 10](10-model-disagreement.md)), completeness
([Standard 6](06-missing-information.md)). This repository's own
[`project-policy.yml`](../project-policy.yml) carries a three-tier vocabulary built that way.

### R4 — Confidence is not fabricated

**Never**, reproduced verbatim from the source:

```text
fabricate confidence
```

A stated tier MUST resolve to a definition, and the record MUST carry the evidence that definition
refers to ([`confidence.not-fabricated`](../rules/confidence.json), non-exemptible).

A confidence tier asserted without reference to the conditions that define it is a mood, and it
travels further than the probability does — readers who ignore a number will still remember that the
system said it was highly confident.

### R5 — Confidence and probability move independently

A record SHOULD NOT let the confidence tier track the probability's distance from 0.5.

The intuition that an extreme probability implies high confidence is wrong and common. A 0.97
prediction from a tiny sample with stale inputs deserves a low tier; a 0.52 prediction from a
well-calibrated model on abundant fresh data deserves a high one. If a project's tiers correlate with
extremity rather than with evidence, they are re-encoding the probability rather than adding to it.

## Prohibitions

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| confuse model confidence with event probability | [`confidence.not-probability`](../rules/confidence.json) | [R1](#r1--confidence-is-never-expressed-as-or-confused-with-the-probability) | yes |
| fabricate confidence | [`confidence.not-fabricated`](../rules/confidence.json) | [R4](#r4--confidence-is-not-fabricated) | yes |

## Additions this standard makes beyond the source

- R1's requirement that confidence be *categorical*, and the argument that a numeric confidence
  invites meaningless arithmetic. The source prohibits confusing the two without prescribing a form
  that prevents it.
- R2's vocabulary mechanism, split between policy and inline declaration.
- R3 in full — what makes a definition checkable, and the observation that a good vocabulary
  summarises the evidence the other standards require.
- R5 in full. The correlation between extremity and confidence is a specific, common error the source
  does not name.
- The decision to enforce R1 structurally rather than by instruction.

## Relationship to other standards

[Standard 2](02-uncertainty.md) is the closest neighbour and the easiest confusion after R1's.
Uncertainty is a numeric property of the estimate; confidence is a categorical judgement about the
evidence as a whole. A tier definition will typically refer to interval width without being reducible
to it — two predictions with identical intervals can warrant different tiers if one rests on stale
data.

[Standard 3](03-calibration.md) is what makes a high tier defensible: measured calibration is the
strongest evidence that a method's probabilities mean what they say, which is why R3 recommends
requiring it.

Standards [5](05-data-freshness.md), [6](06-missing-information.md),
[7](07-sample-size-sufficiency.md), [9](09-regime-change.md), and
[10](10-model-disagreement.md) all supply evidence a tier definition should read.

[Standard 17](17-abstention.md) is the floor below the lowest tier: when the evidence does not support
even the weakest tier, the answer is not a low-confidence prediction but no prediction.

## Implementation

Implemented by four rules in [`rules/confidence.json`](../rules/confidence.json), evaluated by
`scripts/records.mjs`.

`confidence.not-probability` and `confidence.tier-from-vocabulary` carry `full` assurance. The first
rejects any tier matching a numeric pattern, so the R1 conflation cannot be expressed in a valid
record. The second checks set membership against the resolved vocabulary.

`confidence.definitions-declared` and `confidence.not-fabricated` carry `partial`. The evaluator
confirms that a definition exists for each tier and that the record carries the *kinds* of evidence
the definition names. It cannot confirm that the evidence **meets** the definition — that a tier
requiring measured calibration was not claimed on an unmeasured method — which is why
`confidence.not-fabricated` is attestable and its assurance note says so.

**R3 and R5 have no rules.** Whether a definition is checkable rather than another adjective is a
judgement about prose. R5 would require comparing tier assignments against probabilities across many
records to see whether they correlate, which is a property of a corpus rather than of any single
record — a worthwhile analysis, and not one this evaluator performs.
