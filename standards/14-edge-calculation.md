# Standard 14 — Edge Calculation

Edge is the difference between what you believe and what the market believes. It is not a
probability, and it is not money. Both confusions are in the source's must-never list.

Source: item 14 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to predictions that state an edge or an expected value. This standard completes the four-way
separation begun in [Standard 1](01-probability-definition.md) R4 and continued in
[Standard 16](16-confidence-definitions.md): probability, confidence, edge, and expected value are
four different quantities, and this standard owns the last two. All four are laid out together in
[`docs/prediction-model.md`](../docs/prediction-model.md).

Edge is also the one quantity in this pack a checker can settle exactly, because it is fully
determined by two other numbers in the same record.

## Requirements

### R1 — Edge requires a market reference

A record stating an edge MUST also carry the market-implied probability it is measured against
([`edge.requires-market-reference`](../rules/edge.json)).

Edge means *difference from the reference expectation*. With no reference there is no difference, and
a stated edge is being measured against something the record never names — usually an intuition about
what the price "should" be.

### R2 — Edge is the difference it claims to be

The stated edge MUST equal the predicted probability minus the market-implied probability, within the
project's tolerance ([`edge.recomputable`](../rules/edge.json)).

The record's `edge.basis` field admits exactly one value, `probability-minus-market-implied`, which
makes the arithmetic unambiguous. The tolerance lives in `parameters.tolerance` and exists for
floating-point comparison, not for slack.

This is worth checking because edge is the number decisions are made on and the easiest place for a
sign error or a stale market quote to hide. Since it is fully determined by two numbers already
present, any disagreement is a real defect rather than a difference of view.

### R3 — Edge is not fabricated

**Never**, reproduced verbatim from the source:

```text
fabricate edge
```

A stated edge MUST derive from the record's own probability and market reference and reproduce on
recomputation ([`edge.not-fabricated`](../rules/edge.json), non-exemptible).

Edge is the number that justifies acting. Fabricating one invents the entire case for the decision.
Unlike a fabricated probability — where the check can only confirm that sources were cited — this one
is fully checkable, so there is no reason to accept a stated edge on trust and no defensible reason
to waive the rule.

### R4 — Edge is measured against a de-vigged price

The market-implied probability used in R2 MUST have had the bookmaker's margin removed, per
[Standard 15](15-vig-removal.md).

This is the most consequential requirement in the standard and the easiest to skip. Raw prices across
a market sum to more than one; the excess is the margin. An edge computed against raw prices is
largely a measurement of that margin, and it is positive for almost every outcome — which is exactly
how a systematically losing strategy comes to look profitable on paper.

### R5 — Expected value requires a stake and a payout

A record stating an expected value MUST state the stake, the payout, and the currency, and the value
MUST follow from them ([`ev.requires-stake-context`](../rules/ev.json),
[`ev.recomputable`](../rules/ev.json)).

Expected value is the average return on a specific wager, in currency units:

```text
EV = p × (payout − stake) − (1 − p) × stake
```

where `payout` is the total returned on a win, stake included. The most common error is treating the
payout as the net win, which overstates EV by the stake on every calculation.

Without a stake and a payout there is no wager, and a number presented as expected value is a
probability or an edge that has been relabelled.

### R6 — Positive edge is not sufficient reason to act

A positive edge SHOULD NOT be treated as a decision rule on its own.

Edge says the price disagrees with the model. Whether that disagreement is worth acting on depends on
whether the model deserves to be believed over the market: on measured calibration
([Standard 3](03-calibration.md)), on whether the edge exceeds the model's own error
([Standard 12](12-false-precision.md) R2), on whether the models agree
([Standard 10](10-model-disagreement.md)), and on whether the price moved after the quote was taken.

The market is an aggregate of many participants' judgement, and a persistent edge against a liquid
one is more often a defect in the model than an inefficiency. Edge measures disagreement, and
disagreement is a question, not an answer.

## Prohibitions

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| fabricate edge | [`edge.not-fabricated`](../rules/edge.json) | [R3](#r3--edge-is-not-fabricated) | yes |

[Standard 1](01-probability-definition.md) R4 carries the related prohibition against confusing
probability with expected value; the structural separation that enforces it is completed by R5 here.

## Additions this standard makes beyond the source

- R2's fixing of a single basis for the computation, which makes the check exact. The source names
  `edge calculation` without defining it.
- R4's insistence that edge be measured post-vig, and the argument that pre-vig edge is positive
  almost everywhere. The source lists vig removal as a separate standard and does not connect the
  two, but the connection is the reason vig removal matters.
- R5's formula and the payout-versus-net-win warning. The source prohibits confusing probability with
  expected value without saying how expected value is computed.
- R6 in full. The source does not address what a positive edge licenses, and treating edge as a
  decision rule is the most consequential misuse of a correctly computed number.

## Relationship to other standards

[Standard 15](15-vig-removal.md) supplies the de-vigged price R4 requires; it is a prerequisite for
this standard rather than an adjacent concern.

[Standard 12](12-false-precision.md) R2 governs edges too small to act on, and reads the edge this
standard produces.

[Standard 4](04-baseline-probability.md) is the other reference point and answers a different
question: baseline asks what history implies, market asks what other people believe. A prediction can
sit on its base rate while departing sharply from the market.

[Standard 1](01-probability-definition.md) R4 and [Standard 16](16-confidence-definitions.md) hold the
other two corners of the four-way separation.

## Implementation

Implemented by three rules in [`rules/edge.json`](../rules/edge.json) and two in
[`rules/ev.json`](../rules/ev.json), all evaluated by `scripts/records.mjs`, all `structural` with
`full` assurance.

This is the strongest coverage in the pack, and the reason is worth naming: edge and expected value
are the only quantities here that are *fully determined* by other fields in the same record. Every
other standard checks that something was declared and cannot check whether the declaration is true;
these two can be recomputed from first principles, so the check establishes exactly what it claims.

Both categories are kept separate — `edge` and `ev` — even though both belong to this standard,
because the whole point of the separation is that a probability difference and a monetary quantity
never share a home.

Recomputation of the expected value runs against `parameters.currencyTolerance` — half a cent by
default — rather than the `tolerance` used for probabilities. Adoption #1 found the two sharing one
number, which made an expected value published at the minor unit fail permanently. Raising the shared
tolerance would have loosened `edge.recomputable` at the same time, and that rule's strictness is
what makes a fabricated edge detectable, so the two scales were separated instead.

**R4 is enforced under [Standard 15](15-vig-removal.md)** rather than duplicated here, so there is one
definition of correct de-vigging and no second copy to drift.

**R6 has no rule.** Whether a positive edge should be acted on is a decision, not a property of a
record, and the record deliberately carries no recommendation field for a checker to inspect.
