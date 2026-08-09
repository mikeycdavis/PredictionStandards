# Standard 10 — Model Disagreement

Two models saying 0.2 and 0.8 average to the same 0.5 as two models that both say 0.5. The two
situations warrant completely different confidence, and aggregation erases the difference.

Source: item 10 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to predictions produced by more than one model. Abstentions are outside it, and so are
single-model predictions — the rules declare `appliesTo: prediction` and the evaluator reports them
not-applicable, with the reason stated, when a record carries no ensemble.

This standard governs *what disagreement means and what must be done about it*.
[Standard 11](11-ensemble-behavior.md) governs how the ensemble is composed and reported. They are
separate because a well-composed ensemble can still have its disagreement ignored, and a disclosed
disagreement can still come from a cherry-picked set of models.

## Requirements

### R1 — Compute and record the spread

Where an ensemble produced the prediction, the record MUST carry the spread between the highest and
lowest member probability ([`ensemble.disagreement-declared`](../rules/ensemble.json) reads it, and
the evaluator recomputes it from the members rather than trusting the stated value).

Spread is the crudest useful measure and is chosen for exactly that reason: it needs no assumptions,
it is computable from what [Standard 11](11-ensemble-behavior.md) R1 already requires, and it cannot
be gamed by weighting. Richer measures — variance, interquartile range across members, whether the
disagreement is one outlier or a genuine split — are more informative and are left to the project.

### R2 — Major disagreement is never ignored

**Never**, reproduced verbatim from the source:

```text
ignore major disagreement among models
```

Where the spread exceeds the project's threshold, the record MUST declare the disagreement and state
what it means for the prediction
([`ensemble.disagreement-declared`](../rules/ensemble.json)).

"Major" is set by `parameters.disagreementThreshold` in project policy. No number in the source fixes
it, and none would be right across domains: a spread of 0.1 between two well-validated models on a
stable process is a serious signal, while the same spread across a dozen heterogeneous models on a
novel event is unremarkable.

Declaring it is not merely acknowledging it. The note should say what the disagreement is *about* —
whether the models are split into camps or scattered, whether the divergence is recent, whether one
model is known to handle these conditions better. That is what turns a number into something a reader
can act on.

### R3 — Disagreement must affect the output

Where major disagreement is declared, it SHOULD be reflected in the prediction itself — a wider
interval, a lower confidence tier, or an abstention — and not only in a note.

A record that declares serious disagreement and then reports the same narrow interval it would have
reported without it has satisfied the letter of R2 while discarding the information. The disagreement
is evidence about uncertainty; if it does not reach the uncertainty, it has been noted rather than
used.

### R4 — Agreement is not accuracy

A record SHOULD NOT treat low spread as evidence that the prediction is well founded.

Models built by the same team, on the same data, using the same features, will agree with each other
whether or not they are right. Their agreement measures shared assumptions, not truth. The
correlation between members is what determines how much their consensus is worth, and an ensemble
assembled from variations on one approach can produce a spread near zero while being systematically
wrong in the direction its common assumptions lean.

This is the mirror of R2 and the more seductive error: high spread at least prompts questions, while
low spread is quietly reassuring.

## Prohibitions

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| ignore major disagreement among models | [`ensemble.disagreement-declared`](../rules/ensemble.json) | [R2](#r2--major-disagreement-is-never-ignored) | no |

## Additions this standard makes beyond the source

- R1's choice of max-minus-min spread as the measure, and the reasoning for preferring a crude
  measure that cannot be gamed by weighting. The source names `model disagreement` without saying how
  it is quantified.
- R2's placement of "major" in project policy, and the guidance on what a declaration should contain.
- R3 in full — the requirement that disagreement reach the output rather than stopping at a note.
- R4 in full, including the argument about correlated members. The source does not address the
  interpretation of agreement.

## Relationship to other standards

[Standard 11](11-ensemble-behavior.md) supplies the member list this standard's spread is computed
from, and carries the prohibition against assembling that list to produce a desired answer. Cherry-
picking is the direct route to defeating this standard: drop the dissenting model and the spread
falls below the threshold.

[Standard 2](02-uncertainty.md) is where R3's widening lands. Note that these are genuinely different
uncertainties — an interval computed inside one model describes sampling variation under that model's
assumptions, while spread across models describes uncertainty about the assumptions themselves. A
narrow interval and a wide spread together is a coherent and common state, and it means the model
family is confident and the choice of family is not.

[Standard 9](09-regime-change.md) often explains a rise in spread: models react to structural change
at different rates, so growing disagreement between previously aligned models is worth reading as a
possible regime signal.

[Standard 17](17-abstention.md) supplies `model-disagreement` as a coded reason, and
[`abstention.no-manufactured-prediction`](../rules/abstention.json) treats undeclared over-threshold
disagreement as one of the four conditions under which no prediction should have been issued.

## Implementation

Implemented by [`ensemble.disagreement-declared`](../rules/ensemble.json), evaluated by
`scripts/records.mjs`. The evaluator recomputes the spread from the declared members and compares it
against the policy threshold, so a record that understates its own spread is caught.

Assurance is `partial`, and the boundary is specific: the computation is exact **for the models the
record lists**. It says nothing about models that were run and never mentioned — that gap belongs to
[`ensemble.no-cherry-picking`](../rules/ensemble.json), which is itself only `partial` for the same
reason. Between them they establish that the *disclosed* ensemble was handled honestly, which is
strictly weaker than establishing that the ensemble was.

**R3 and R4 have no rules.** R3 was considered as a check — require a wider interval when
disagreement is declared — and rejected: there is no defensible general relationship between spread
and interval width, so any threshold would be arbitrary, and an arbitrary threshold that can be met
by widening an interval slightly would create the appearance of the requirement without its
substance. R4 concerns how a reader interprets low spread and is not a property of the record.
