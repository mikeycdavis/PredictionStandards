# Standard 15 — Vig Removal When Relevant

Quoted prices are not probabilities. They include the margin that pays the book, and treating them as
probabilities overstates every outcome at once.

Source: item 15 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to predictions that carry a market reference. The source's phrase is
`vig removal when relevant`, and this standard treats "when relevant" as a determination the record
must *state* rather than one a reader may infer: either a market reference is given, or its absence is
declared with a reason.

The vocabulary is from betting markets, but the concern is general. Any quoted set of prices across
mutually exclusive outcomes — bookmaker odds, prediction-market contracts, a dealer's two-sided
quote — carries a spread that must come out before the prices can be read as beliefs.

## Requirements

### R1 — State the market reference, or declare its absence

A prediction MUST carry a market-implied probability with its source and as-of instant, or state that
no market reference exists and why
([`market.reference-present-or-declared-absent`](../rules/market.json)).

Where a liquid market exists, it is the strongest available reference expectation, and a prediction
that ignores it claims to know better than the aggregate without saying so. Where none exists —
which is common — saying so takes one line and stops the omission from reading as an oversight.

The as-of instant matters as much as the value. Prices move, and an edge computed against a quote
from three hours ago is measuring a market that no longer exists.

### R2 — Measure the overround

Where raw prices are supplied, the excess over a coherent probability distribution MUST be computed:

```text
overround = Σ(1 / decimal price) − 1
```

A three-outcome market quoted at 2.10 / 3.40 / 4.20 implies 0.476 + 0.294 + 0.238 = 1.008, an
overround of 0.8 percent. Real markets run considerably higher — a few percent is typical, and much
more in illiquid ones.

### R3 — Remove the margin before treating prices as probabilities

Where the overround is positive, the record MUST state that it was removed and by what method
([`market.vig-removed`](../rules/market.json)), and the resulting implied probability MUST follow
from the prices under that method
([`market.implied-probability-consistent`](../rules/market.json)).

The methods the record schema admits:

- **proportional** — divide each raw implied probability by the total. Simple, assumes the margin is
  loaded evenly across outcomes, and is the method the evaluator recomputes in full.
- **power** — solve for an exponent that normalises the total. Loads more of the margin onto
  longshots.
- **shin** — models the margin as protection against insider betting. Generally the best-performing
  of the three on real markets.
- **none-needed** — a claim that the prices already sum to one, which the evaluator checks.

Proportional is the usual default and is known to be wrong in a specific direction: bookmakers load
more margin onto longshots, so proportional de-vigging leaves favourites underpriced and longshots
overpriced relative to true belief. For edges near the materiality threshold on longshot outcomes,
the choice of method can be larger than the edge itself.

### R4 — Vig removal is a prerequisite for edge

The de-vigged probability is what [Standard 14](14-edge-calculation.md) R4 measures edge against.

This is the reason the standard exists. Raw prices sum to more than one, so a model's probability
exceeds the raw implied probability for *most* outcomes, producing apparent positive edge nearly
everywhere. A strategy built on pre-vig edge bets almost everything and loses at approximately the
rate of the margin — while its records show a consistent, plausible-looking edge throughout.

### R5 — A market reference is evidence, not an oracle

A record SHOULD NOT treat the de-vigged market probability as ground truth.

Markets aggregate many participants' judgement and are hard to beat, which is why they are the
reference. They are not correct: thin markets are noisy, closing prices are better than opening ones,
and known biases persist. The de-vigged price is the best available estimate of what other people
believe, which is a strong reference expectation and not a measurement of the world.

## Prohibitions

None of the source's must-never rules attach to this standard directly. Its closest relative is
`fabricate edge` ([Standard 14](14-edge-calculation.md) R3), which this standard makes checkable:
an edge measured against an un-de-vigged price is not fabricated so much as systematically
overstated, and R4 is what prevents it.

## Additions this standard makes beyond the source

- The reading of "when relevant" as a determination the record must state rather than infer, and the
  declared-absence branch that makes it answerable.
- R2's formula, and R3's enumeration of methods with their differing assumptions. The source names
  `vig removal when relevant` without defining the overround or naming a method.
- The warning under R3 that proportional de-vigging is wrong in a known direction, and that the error
  can exceed a marginal edge.
- R4's account of why pre-vig edge produces a consistently losing strategy that looks profitable.
  This is the strongest argument for the standard and the source does not make it.
- R5 in full.
- The generalisation in Scope beyond betting markets.

## Relationship to other standards

[Standard 14](14-edge-calculation.md) depends on this standard entirely; R4 is the link. Reading them
together is the only way either makes sense.

[Standard 4](04-baseline-probability.md) is the other reference point, answering what history implies
rather than what participants believe. Both are references and they are not interchangeable.

[Standard 5](05-data-freshness.md) applies to the market quote as much as to any other input — R1's
as-of instant is a freshness declaration, and a stale price is stale data.

[Standard 12](12-false-precision.md) R2 is where the de-vigging method's error becomes decisive: an
edge below the materiality threshold may be entirely an artefact of the method chosen in R3.

## Implementation

Implemented by three rules in [`rules/market.json`](../rules/market.json), evaluated by
`scripts/records.mjs`.

`market.reference-present-or-declared-absent` carries `full` assurance — the schema's discriminated
union makes the two branches the only admissible shapes.

`market.vig-removed` and `market.implied-probability-consistent` carry `partial`, and the boundary is
specific. The overround is recomputed exactly from supplied prices, so its presence is established
beyond doubt. The **proportional** method is recomputed in full and compared within tolerance. For
**power** and **shin** the evaluator checks only that a method was named and that the result is
plausible, because both take parameters the record does not carry — implementing them properly would
mean asking records to declare fitted parameters, which is a schema change this pack has not made.

Since 1.1.0 a **stated** `market.vig.overround` is compared with the value the quoted prices imply.
The computation was already being performed to decide whether removal was required; only the
comparison was missing, so a record could publish any margin it liked beside prices that said
otherwise.

That limit is in both rules' assurance notes. It means a record claiming shin de-vigging is taken
largely on trust, while one claiming proportional is verified.

**R5 has no rule**, and neither does the judgement in R3 about whether the chosen method suits the
market — that is a modelling decision, and the evaluator establishes which method was declared, not
whether it was the right one.
