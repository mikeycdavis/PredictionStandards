# Standard 1 — Probability Definition

A probability is a probability *of* something, produced *somehow*. A number without a resolvable
outcome behind it and a named method under it is not a prediction — it is a figure that will be
quoted as one.

Source: item 1 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to every record, prediction and abstention alike: an abstention still concerns a specific
question, and one that cannot say what question it is declining to answer is not useful. This
standard also fixes the first of the four separations this pack is built on — probability is not
expected value — and owns the prohibition against changing methodology in silence, which the source
lists among the must-never rules without giving it a standard of its own.

## Requirements

### R1 — The outcome must be resolvable

Every record MUST state the event, the precise condition that counts as the event occurring, and the
source that settles it. Rule [`record.identity-present`](../rules/record.json) and
[`probability.definition-complete`](../rules/probability.json) check that these are present.

"Precise" means falsifiable by someone who was not involved. *It will rain tomorrow* is not an
outcome definition; *measurable precipitation exceeding 0.2 mm at station EGLL between 00:00 and
23:59 UTC on 12 August, per the Met Office daily record* is. The test is whether two people holding
opposite views could still agree, after the fact, on which of them was right.

This is not pedantry about wording. An unresolvable outcome cannot be scored, which means it can
never contribute to a calibration measurement ([Standard 3](03-calibration.md)), which means the
method behind it can never be shown to work or fail.

### R2 — Probabilities are numbers in the unit interval

Every probability in a record — the prediction, the interval bounds, the baseline, the market-implied
value, each ensemble member — MUST lie between 0 and 1 inclusive. Enforced by
[`probability.in-unit-interval`](../rules/probability.json).

The usual violation is a percentage that lost its conversion somewhere. It matters because it is
silent: 62 is a perfectly good number, and every quantity computed from it — edge, expected value,
the aggregate of an ensemble — comes out wrong in a way that looks arithmetic rather than
conceptual.

### R3 — The methodology is named and versioned

Every record MUST name the methodology that produced it and the version of that methodology that
ran ([`probability.methodology-declared`](../rules/probability.json)). Two predictions are comparable
only if they were made the same way, and without a version there is no way to know whether they were.

### R4 — Probability is not expected value

**Never**, reproduced verbatim from the source:

```text
confuse probability with expected value
```

These answer different questions in different units. Probability is how likely the outcome is, on a
scale from 0 to 1. Expected value is what a particular wager on it is worth, in currency, and it
requires a stake and a payout that the probability alone does not supply. A high probability with a
poor price is a bad bet; a low probability with a generous one may be a good bet. A system that lets
either number stand in for the other will eventually recommend the first and reject the second.

This pack enforces the separation structurally rather than by instruction. `output.probability` holds
the probability and admits nothing monetary; `expectedValue` requires `stake`, `payout`, and
`currency`, and is recomputed from the probability rather than substituted for it. Conflating them is
therefore a schema error, not a matter of remembering.
[`probability.not-expected-value`](../rules/probability.json) is non-exemptible: no policy may waive
it, and violating it stops the work rather than merely failing a check. See
[Standard 14](14-edge-calculation.md) for the third and fourth members of the family, and
[Standard 16](16-confidence-definitions.md) for the second.

### R5 — Probabilities are not fabricated

**Never**, reproduced verbatim from the source:

```text
fabricate probabilities
```

A stated probability MUST trace to the declared methodology and at least one declared data source
([`probability.not-fabricated`](../rules/probability.json), non-exemptible).

Be clear about what the automated check establishes: that a methodology and sources were *cited*, not
that the number came from them. A probability typed in by hand and attributed to a real model passes
it. That gap is why the rule is attestable and why its `$assuranceNote` says so plainly — a check
that cannot see the failure it is named for must not be reported as if it can.

### R6 — A change of methodology is declared

**Never**, reproduced verbatim from the source:

```text
silently change prediction methodology
```

Where successive records share a `seriesId`, a change in methodology version MUST be accompanied by
`changedFromPrevious` and a note saying what changed
([`probability.methodology-change-declared`](../rules/probability.json)).

Nothing here forbids changing methods; methods should improve. What is forbidden is changing them
invisibly. A series of predictions reads as a trajectory, and when the method shifts underneath it,
movement caused by the change is indistinguishable from movement in the world. The reader sees a
forecast rising from 0.4 to 0.6 and concludes something happened, when what happened was a new
feature in the model.

## Prohibitions

Three of the source's must-never rules are enforced under this standard. Each is quoted at its
requirement above and repeated here so the prohibitions carried by this standard can be read in one
place.

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| confuse probability with expected value | [`probability.not-expected-value`](../rules/probability.json) | [R4](#r4--probability-is-not-expected-value) | yes |
| fabricate probabilities | [`probability.not-fabricated`](../rules/probability.json) | [R5](#r5--probabilities-are-not-fabricated) | yes |
| silently change prediction methodology | [`probability.methodology-change-declared`](../rules/probability.json) | [R6](#r6--a-change-of-methodology-is-declared) | no |

The cell text above is quoted from the source but deliberately makes no verbatim claim: the three
bullets are not adjacent in the source, so a block asserting they are would be false. The verbatim
quotations are the fenced blocks at R4, R5, and R6.

## Additions this standard makes beyond the source

- R1's requirement that the outcome definition be resolvable by an uninvolved third party, and the
  test for it. The source names "probability definition" as a standard without saying what makes one
  adequate.
- R2 in full. The source does not state that probabilities lie in the unit interval; it is assumed,
  and the assumption is worth checking because the violation is silent.
- R3's versioning requirement, which the source implies through its prohibition on silent
  methodology change but does not state as a positive obligation. Without a version, R6 has nothing
  to compare.
- Assigning the silent-methodology-change prohibition to this standard. The source lists it among the
  must-never rules but provides no corresponding entry in its list of required standards, so it had
  to be housed somewhere; methodology is declared here, so the prohibition against changing it
  quietly belongs here too. [Standard 3](03-calibration.md) was the alternative, on the grounds that
  methodology changes invalidate calibration histories — a defensible choice this pack did not make.
- The structural enforcement of R4. The source says not to confuse the two; making the confusion
  impossible to express, rather than merely prohibited, is this pack's decision.

## Relationship to other standards

[Standard 2](02-uncertainty.md) requires the interval that stops R1's probability from being read as
exact. [Standard 4](04-baseline-probability.md) supplies the reference the probability is judged
against; without it, a well-defined probability is still uninterpretable.
[Standard 12](12-false-precision.md) governs how many digits of it may be shown.

The four-way separation begun in R4 completes across [Standard 14](14-edge-calculation.md) (edge and
expected value) and [Standard 16](16-confidence-definitions.md) (confidence). All four are laid out
together in [`docs/prediction-model.md`](../docs/prediction-model.md).

[Standard 17](17-abstention.md) is the escape hatch this standard depends on: R5 forbids inventing a
probability, which is only a reasonable demand because declining to give one is a supported outcome.

## Implementation

Implemented by six rules in [`rules/probability.json`](../rules/probability.json) and two in
[`rules/record.json`](../rules/record.json), all evaluated by `scripts/records.mjs`.

The two in `record.json` are filed under this standard because they are preconditions for everything
it asks. [`record.schema-valid`](../rules/record.json) establishes that the document conforms to
[`schemas/prediction-record.schema.json`](../schemas/prediction-record.schema.json) at all — a record
that does not is not a weakly supported prediction but an unread document, and evaluating it field by
field would report absences that are really parse failures.
[`record.identity-present`](../rules/record.json) establishes that it says what it is predicting,
which R1 then holds to a standard of precision.

R1's precision requirement is **not** machine-checked and cannot be. The evaluator establishes that an
outcome definition was written; whether it is unambiguous is a judgement, and
`probability.definition-complete` carries assurance `partial` with an note saying exactly that.

R5's rule is likewise `partial`: it detects a probability with no methodology or sources behind it,
and cannot detect one that cites them falsely. R6 is detectable **only** across records that share a
`seriesId` and are evaluated together — a methodology change between records checked one at a time,
or carrying no series identifier, is invisible to it. Both limits are recorded in the rules' assurance
notes rather than left for a reader to discover.
