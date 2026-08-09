# Standard 4 — Reference/Baseline Probability

A prediction with no reference point cannot be judged informative. Seventy percent is impressive
against a base rate of twenty and worthless against a base rate of seventy, and the number alone does
not say which.

Source: item 4 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to every record, including abstentions — the base rate is often exactly what makes an
abstention defensible, since it shows the prediction would have added nothing to what was already
known.

The baseline governed here is the *reference expectation from evidence*: a base rate, a naive
forecast, the status quo. The related but distinct market reference belongs to
[Standard 15](15-vig-removal.md), and the two are not interchangeable — a market price already
incorporates other people's judgement, while a base rate is what the history alone implies.

## Requirements

### R1 — State a baseline, or declare that none exists

Every record MUST carry a baseline probability, or state that no baseline exists and why
([`baseline.present-or-declared-absent`](../rules/baseline.json)).

The choice is deliberate and the second branch is real: some events genuinely have no meaningful base
rate, and forcing a fabricated one would be worse than admitting the gap. What is not permitted is
silence, which is indistinguishable from having never looked.

Where a baseline exists, it is usually one of:

- a **base rate** — how often this outcome has occurred historically in a comparable population;
- a **naive forecast** — what a trivial method predicts, such as "same as last period";
- the **status quo** — the probability implied by nothing changing.

### R2 — The baseline names its source and its basis

A stated baseline MUST record where it came from and what population and period it is a rate over
([`baseline.source-stated`](../rules/baseline.json)).

This requirement carries more weight than it appears to. A base rate is only a reference if you know
what it is a rate *of*, and the same event has different base rates across different populations. The
failure mode is not usually fabrication but selection: a baseline chosen after the prediction, from
whichever population makes the prediction look most informative. Recording the population and period
at the time makes that choice answerable.

### R3 — A departure from the baseline is where the claim lives

Where a prediction differs materially from its baseline, the record SHOULD be able to say what
information justifies the departure.

This is the substantive point of the standard. The baseline is what the prediction is claiming to
improve on, and the size of the departure is the size of the claim. A prediction that lands on its
base rate is saying "nothing here changes what history implies" — a legitimate and often correct
statement. A prediction far from it is saying the opposite, and that is where the evidence has to be.

Departures too small to be meaningful are governed by [Standard 12](12-false-precision.md) R2, which
requires justification when the difference falls below the project's materiality threshold.

## Prohibitions

None of the source's must-never rules attach to this standard directly, but two act on it from
elsewhere. [Standard 12](12-false-precision.md)'s prohibition on calling a tiny modeled difference
meaningful is measured against this baseline as well as against the market reference, and
[Standard 1](01-probability-definition.md)'s prohibition on fabricated probabilities applies to a
baseline as much as to a prediction — a base rate invented to make a forecast look good is a
fabricated probability wearing a reference's clothes.

## Additions this standard makes beyond the source

- R1's provision for declaring the absence of a baseline. The source names
  `reference/baseline probability` as a required standard without addressing what to do when none
  exists, and a requirement with no honest escape route gets satisfied dishonestly.
- R2 in full, and the observation that the realistic failure is selection rather than fabrication.
- R3 in full — the framing of the departure as the size of the claim. The source does not discuss how
  the baseline should be used once recorded.
- The enumeration of baseline kinds under R1, which the source does not provide.
- The explicit separation of the evidential baseline from the market reference. The source lists
  `reference/baseline probability` and `market/reference expectations` as separate items in the
  prediction model, so the separation is implied there, but it is not stated and the two are commonly
  merged.

## Relationship to other standards

[Standard 15](15-vig-removal.md) governs the market reference, which answers a different question:
this standard asks what history implies, that one asks what other people believe. A prediction can
sit on its base rate while departing sharply from the market, and the two departures mean different
things.

[Standard 14](14-edge-calculation.md) computes edge against the market rather than against this
baseline, deliberately — edge is about mispricing, not about informativeness.

[Standard 12](12-false-precision.md) R2 reads the baseline departure this standard produces.
[Standard 7](07-sample-size-sufficiency.md) applies to the baseline too: a base rate drawn from
eleven historical cases is a weak reference, and R2's `basis` field is where that becomes visible.

## Implementation

Implemented by two rules in [`rules/baseline.json`](../rules/baseline.json), evaluated by
`scripts/records.mjs`.

`baseline.present-or-declared-absent` carries `full` assurance: the schema's discriminated union
makes "a probability with a source and basis" and "a declared absence with a reason" the only two
admissible shapes, so the check is exact.

`baseline.source-stated` carries `partial`. The evaluator confirms a source and basis were written;
it cannot confirm that the population described is the relevant one, which is precisely where R2's
selection failure lives. The rule's assurance note says so.

**R3 has no rule.** Whether a departure from the baseline is justified by the evidence is the central
judgement of the whole prediction, and no structural check reaches it. What the tooling can do — and
does, under [Standard 12](12-false-precision.md) — is catch the opposite error of treating an
immaterial departure as meaningful.
