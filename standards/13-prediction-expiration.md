# Standard 13 — Prediction Expiration

A prediction with no expiry gets quoted forever. Its inputs age, the regime shifts, and the number
keeps circulating with the authority it had on the day it was made, because nothing in it says
otherwise.

Source: item 13 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to predictions. An abstention makes no claim that can go out of date, so the rules here
declare `appliesTo: prediction` and are reported not-applicable on an abstention record — with the
reason stated, rather than passing silently.

## Requirements

### R1 — Every prediction states an expiry

A prediction MUST carry an `expiresAt` instant
([`expiration.expiry-present`](../rules/expiration.json)).

The expiry is the answer to "how long is this good for", and the person who made the prediction is
the only one positioned to answer it. Left unstated, the question is answered by default — by whoever
finds the number later and has no way to judge — and the default is always "still valid".

### R2 — The expiry follows the generation

`expiresAt` MUST be strictly later than `generatedAt`
([`expiration.expiry-after-generation`](../rules/expiration.json)).

An expiry at or before the moment of generation describes a prediction that was never valid. In
practice this is almost always a timezone error or a field-ordering mistake rather than an intention,
which is why both timestamps in the record schema require an explicit offset.

### R3 — The expiry follows from the inputs and the subject

An expiry SHOULD be derived from how fast the prediction's evidence goes stale and how fast its
subject moves, not from a convenient default.

The two constraints:

- **input aging.** A prediction built on data already near the edge of its freshness window
  ([Standard 5](05-data-freshness.md)) should not carry a long expiry — its evidence is aging even as
  the prediction sits.
- **subject dynamics.** An expiry should generally fall at or before the next point at which
  materially new information is expected: a scheduled release, a team announcement, a market open.

A uniform default across a heterogeneous set of predictions will be too long for the fast-moving ones,
and that is the direction that fails silently.

### R4 — An expired prediction is not evidence

An expired prediction MUST NOT be used as current evidence, cited as a current probability, or
counted toward a current aggregate.

This is what R1 is for, and it is the requirement most likely to be violated downstream of a
perfectly well-formed record. An expired prediction remains a true record of what was believed at a
time; it stops being a claim about the present. The distinction matters most for historical
evaluation, where a stale prediction pulled into a current comparison quietly corrupts the
measurement.

### R5 — Expiry is not resolution

`expiresAt` and `subject.resolveBy` answer different questions and MUST NOT be conflated.

Resolution is when the outcome becomes known. Expiry is when the prediction stops being usable. A
prediction about an election six months out can expire in a week — a week later, enough has changed
that the number should be regenerated, long before anyone knows who won. Expiry is usually much
earlier than resolution, and setting expiry to the resolution date is the most common way of
producing an expiry that does no work.

## Prohibitions

None of the source's must-never rules attach to this standard directly. The closest is
`use stale information without accounting for staleness`
([Standard 5](05-data-freshness.md)) — that governs stale *inputs*, this governs a stale *output*. R4
is effectively that prohibition applied one step later in the pipeline, but the source's bullet
concerns information used in making a prediction, so this pack states R4 as a requirement rather than
inventing a prohibition the source did not write.

## Additions this standard makes beyond the source

- R2 in full. The source names `prediction expiration` without stating the coherence condition.
- R3's two derivation constraints — input aging and subject dynamics.
- R4 in full, including its consequence for historical evaluation. The source requires expiration
  without saying what expiry obliges a consumer to do.
- R5 in full. The confusion between expiry and resolution is common and the source does not
  distinguish them; the record schema carries both fields for this reason.

## Relationship to other standards

[Standard 5](05-data-freshness.md) is the mirror image: freshness governs how old the inputs may be,
expiration governs how long the output stays valid. R3 links them directly.

[Standard 9](09-regime-change.md) is the discontinuous case — a regime change can invalidate a
prediction long before its stated expiry, and no expiry chosen in advance anticipates it.

[Standard 3](03-calibration.md) R2 depends on R4: a calibration measurement that includes predictions
used past their expiry is measuring something other than the method's performance.

[Standard 1](01-probability-definition.md) R1 supplies `subject.resolveBy`, which R5 distinguishes
from expiry.

## Implementation

Implemented by two rules in [`rules/expiration.json`](../rules/expiration.json), evaluated by
`scripts/records.mjs`. Both carry `full` assurance: the timestamps are present and ordered, or they
are not. These are among the few rules in this pack that establish exactly what they claim.

All expiry arithmetic runs against the evaluation's `--as-of` instant rather than the wall clock, so
a check is reproducible and a record's verdict does not silently change between two runs on the same
inputs.

**R3, R4, and R5 have no rules.** R3 concerns whether a chosen expiry is *sensible*, which requires
knowing the subject's dynamics. R4 governs consumers of a record rather than the record itself —
nothing in a well-formed prediction can prevent someone quoting it a year later, and this is the
clearest case in the pack of a requirement that documentation must carry because tooling cannot. R5
would require the evaluator to judge whether an expiry equal to the resolution date was intended or
lazy, and it cannot.
