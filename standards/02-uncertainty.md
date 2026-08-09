# Standard 2 — Uncertainty

A point estimate on its own overstates what is known. The interval is not decoration around the
number; it is the part that says how much weight the number can carry.

Source: item 2 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to every prediction. Abstentions are outside it: an abstention makes no estimate, so it has
no uncertainty to quantify — the rules here declare `appliesTo: prediction` and the evaluator reports
them not-applicable on an abstention record rather than passing them silently.

## Requirements

### R1 — Every prediction states an interval

A prediction MUST carry an interval with a lower bound, an upper bound, and the level the interval is
stated at ([`uncertainty.interval-present`](../rules/uncertainty.json)).

A bare 0.62 is read as more precise than it is, and readers have no way to tell whether it came from
ten observations or ten thousand. Two predictions of 0.62, one with an interval of [0.60, 0.64] and
one with [0.35, 0.85], support entirely different decisions, and nothing else in a record makes that
difference visible.

The level matters as much as the bounds. An interval quoted without saying whether it is a 50%, 90%,
or 95% interval is three different claims sharing one notation.

### R2 — The interval must be coherent

The lower bound MUST NOT exceed the upper bound, the point estimate MUST lie between them, and the
level MUST fall strictly between 0 and 1 ([`uncertainty.interval-coherent`](../rules/uncertainty.json)).

An interval that excludes its own point estimate means the two numbers were not produced by the same
computation — usually a transcription error, occasionally a units error, never something to be read
past. A level of exactly 0 or 1 describes an interval no one can act on: the first is empty, the
second is the whole unit interval dressed as information.

### R3 — State how the interval was derived

A prediction SHOULD record the method behind its interval — `bootstrap, 2000 resamples`, `Wilson
score`, `posterior 5th–95th percentile`. The record schema provides `interval.method` for it.

This is a SHOULD rather than a MUST because a missing method makes the interval less interpretable
without making it wrong, and because the honest range of methods is too wide to enumerate. It matters
because intervals from different methods are not comparable: a bootstrap interval and a normal
approximation on the same small sample can differ enough to change a decision.

## Prohibitions

None of the source's must-never rules attach to this standard. The nearest neighbour,
`present excessive decimal precision unsupported by the model`, belongs to
[Standard 12](12-false-precision.md) — false precision is about how many digits are shown, while this
standard is about whether the uncertainty is shown at all. They are easily conflated and are
different failures: a well-formed interval can still accompany a probability quoted to four
meaningless decimal places.

## Additions this standard makes beyond the source

- R1's requirement that the interval's *level* be stated. The source names uncertainty as a standard
  without specifying what an adequate expression of it contains.
- R2 in full, including the specific coherence conditions. These exist because they are cheap to
  check and always indicate a real defect.
- R3, which the source does not mention at all.
- The decision that uncertainty is expressed as an interval rather than as a variance, a standard
  error, or a distribution. An interval was chosen because it is directly readable by someone who is
  not a statistician, and because it can be checked against the point estimate for coherence. The
  cost is real: an interval discards the shape of the distribution, and a skewed posterior summarised
  as two bounds loses information a variance would also have lost differently.

## Relationship to other standards

[Standard 12](12-false-precision.md) is the closest relative: the interval width is what determines
how many digits of the point estimate are meaningful, so R1 here supplies the evidence that standard
reasons about. [Standard 7](07-sample-size-sufficiency.md) governs the sample the interval is derived
from — a narrow interval on a tiny sample is a claim about the method, not about the world.

[Standard 16](16-confidence-definitions.md) is the one most often confused with this standard.
Uncertainty is a property of the estimate, expressed numerically as a range. Confidence is a
categorical judgement about the strength of the evidence as a whole, and a project's confidence
vocabulary will typically *refer* to interval width without being reducible to it.

[Standard 10](10-model-disagreement.md) describes a second, independent source of uncertainty: an
interval computed inside one model says nothing about whether another model disagrees.

## Implementation

Implemented by two rules in [`rules/uncertainty.json`](../rules/uncertainty.json), both
`structural` with `full` assurance and both evaluated by `scripts/records.mjs`. These are among the
few rules in this pack that can be checked exactly, because coherence is arithmetic on numbers the
record already contains.

**R3 has no rule and is not checked.** It is a SHOULD with no machine-verifiable criterion — the
evaluator could confirm that the `method` string is non-empty, which would establish only that
somebody typed something. That check was deliberately not written: a rule that can be satisfied
without doing the thing it names is worse than no rule, because it converts an open question into a
green tick.
