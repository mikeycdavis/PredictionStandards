# Standard 12 — False Precision

Readers treat extra digits as extra information. When the digits come from arithmetic rather than
from evidence, they are the opposite.

Source: item 12 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to predictions. This standard carries two of the source's prohibitions, and they are related
but distinct: one concerns how finely a number is *written*, the other concerns whether a *difference*
between numbers is worth acting on. Both are ways of presenting noise as signal.

## Requirements

### R1 — Stated precision must not exceed what the evidence supports

**Never**, reproduced verbatim from the source:

```text
present excessive decimal precision unsupported by the model
```

A probability MUST NOT be stated to more decimal places than the position of its standard error's
first significant digit ([`precision.supported-by-sample`](../rules/precision.json)).

Writing 0.6237 from a sample of forty claims a resolution the data cannot deliver. The standard error
of a proportion near 0.6 on forty observations is roughly 0.077, which puts the first significant
digit of the error in the *second* decimal place. Two decimals is therefore the most that can be
justified, and the third and fourth are noise rendered in the same typeface as signal.

Concretely, with `se = sqrt(p(1-p)/n)`, the limit is `ceil(-log10(se))` decimal places:

| Sample | Standard error | Decimals supported |
|---|---|---|
| 40 | 0.077 | 2 |
| 1,240 | 0.014 | 2 |
| 9,400 | 0.005 | 3 |

The stricter alternative — requiring the stated resolution to be no finer than the standard error
itself — was implemented first and rejected. It is not monotone in the sample size, and it fails
almost every record stating an ordinary two decimal places. A check that fails correct records is a
check somebody switches off, which is worse than a slightly permissive one.

This is a heuristic and the rule says so: it assumes independent observations and takes the declared
sample at face value.

Because JSON parses `0.60` as `0.6` and loses the trailing zero, a record that cares about its stated
precision supplies `output.probabilityStated` as a string. Where it is absent the evaluator falls
back to the shortest representation of the number, which is the lenient reading.

### R2 — A tiny difference is not called meaningful without justification

**Never**, reproduced verbatim from the source:

```text
call a tiny modeled difference meaningful without justification
```

Where a stated edge, or a departure from the baseline, falls below the project's materiality
threshold, the record MUST explain why it is nonetheless meaningful
([`precision.material-difference-justified`](../rules/precision.json)).

A two-tenths-of-a-percent edge is well inside the error of almost any model that produced it. Acting
on it is acting on noise, and doing so repeatedly converts a modelling artefact into a systematic
loss. The threshold lives in `parameters.materialityThreshold` in project policy, because how small
is too small depends on the model's own error and nothing in the source fixes a number.

A justification has to engage with the model's error rather than restate the difference. "The edge is
small but consistent across 400 independent cases and the model's out-of-sample error on this class
is 0.003" is a justification. "Small edges add up" is not.

### R3 — Precision is not accuracy

A record SHOULD NOT present a finely stated number as a well-supported one.

These are independent properties and the vocabulary invites confusing them. A probability stated to
six decimal places from a broken model is precise and wrong; one stated as "about 0.6" from a
well-calibrated method is imprecise and right. Rounding a bad estimate does not improve it, and
neither does extending it.

### R4 — Report at the precision decisions are made at

A project SHOULD state probabilities at the resolution that changes a decision, and no finer.

If a threshold sits at 0.5, the difference between 0.62 and 0.6237 changes nothing that anyone does.
Reporting the extra digits adds no decision-relevant information while adding the impression of
authority, and it invites downstream consumers to build comparisons that the underlying evidence
cannot bear.

## Prohibitions

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| present excessive decimal precision unsupported by the model | [`precision.supported-by-sample`](../rules/precision.json) | [R1](#r1--stated-precision-must-not-exceed-what-the-evidence-supports) | no |
| call a tiny modeled difference meaningful without justification | [`precision.material-difference-justified`](../rules/precision.json) | [R2](#r2--a-tiny-difference-is-not-called-meaningful-without-justification) | no |

## Additions this standard makes beyond the source

- R1's specific criterion — decimal resolution against one binomial standard error. The source
  prohibits excessive precision without saying what makes precision excessive, and an unquantified
  prohibition cannot be checked.
- The `probabilityStated` mechanism and the reasoning behind it. JSON's inability to preserve
  trailing zeros is a real obstacle to this requirement and the source does not anticipate it.
- R2's account of what a justification must contain.
- R3 and R4 in full. The source addresses neither the precision/accuracy distinction nor
  decision-relevant resolution.

## Relationship to other standards

[Standard 7](07-sample-size-sufficiency.md) supplies the sample R1 is computed against; the two
standards are a pair and neither works alone. [Standard 2](02-uncertainty.md) is the honest
alternative to false precision — an interval expresses what a rounded point estimate can only gesture
at.

[Standard 4](04-baseline-probability.md) and [Standard 14](14-edge-calculation.md) supply the two
differences R2 measures: the departure from baseline and the edge against the market.

[Standard 10](10-model-disagreement.md) provides context R1's arithmetic misses entirely: a
probability may be stated within its sampling error and still be far less certain than that implies,
because the models disagree about it.

## Implementation

Implemented by two rules in [`rules/precision.json`](../rules/precision.json), evaluated by
`scripts/records.mjs`.

Both carry `partial` assurance. `precision.supported-by-sample` uses the binomial standard error,
which assumes independence and trusts the declared sample — precision inflated by correlated
observations passes it. `precision.material-difference-justified` checks that an explanation exists
when the difference is below threshold; whether the explanation is sound is not machine-checkable,
and a record can satisfy it with a sentence that says nothing.

**R3 and R4 have no rules.** R3 is an interpretive caution rather than a property of a record. R4
depends on where a project's decision thresholds sit, which the record does not carry and which
varies per consumer of the same prediction.
