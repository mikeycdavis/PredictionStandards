# Standard 11 — Ensemble Behavior

An ensemble reported only by its aggregate is a single opinion wearing the authority of several. The
member probabilities are what make weighting, disagreement, and exclusion visible at all.

Source: item 11 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to predictions produced by more than one model. This standard governs *composition and
reporting*: which models are in, which were left out, and how their outputs became one number.
[Standard 10](10-model-disagreement.md) governs what to do when they disagree.

## Requirements

### R1 — Enumerate the members

Every ensemble member MUST be listed with its name, its version, and the probability it produced
([`ensemble.members-enumerated`](../rules/ensemble.json)).

The version is not ceremony. An ensemble whose members are named but unversioned cannot be
reproduced, and a member silently upgraded between two predictions in a series produces movement that
looks like new information — the same failure [Standard 1](01-probability-definition.md) R6 addresses
for the methodology as a whole.

### R2 — State how members were combined

The record MUST name the aggregation method, and SHOULD give the weights where they are not uniform
([`ensemble.aggregation-stated`](../rules/ensemble.json)).

A mean, a median, and a weighted mean give materially different answers from the same members,
and the differences are largest exactly when the members disagree — which is when it matters. A
median is robust to one wild member; a mean is not; a weighted mean is whatever the weights say it
is. Without the method, the reported number cannot be reproduced from its parts.

Weights deserve particular attention because they are the quiet route to the result. Weights chosen
to produce a preferred answer are cherry-picking by degree rather than by exclusion, and they leave
even less trace.

### R3 — Models are not selected for producing the desired answer

**Never**, reproduced verbatim from the source:

```text
cherry-pick models because they predict the desired result
```

Every model considered and left out MUST be listed with a reason that does not reduce to disagreeing
with the result ([`ensemble.no-cherry-picking`](../rules/ensemble.json)).

Defensible exclusions are about *provenance and applicability*: the model is known to be broken, it
was trained on a population that does not apply here, its inputs are unavailable for this case, it
has been superseded. The indefensible reason is that it gave an unwelcome number. Both produce an
identical-looking absence, which is why the reasoning is what gets recorded rather than the act.

Dropping the models that disagree produces an ensemble that agrees with itself and with nothing else,
and it defeats [Standard 10](10-model-disagreement.md) directly: remove the dissenter and the spread
falls below the threshold, so the disagreement never has to be declared.

### R4 — Decide the composition before seeing the outputs

A project SHOULD fix which models enter an ensemble, and how they are weighted, before their
predictions for a given case are known.

This is the only reliable defence against R3, and it is a process requirement rather than a property
of a record. Once the outputs are visible, every exclusion has a plausible methodological story
available, and the person constructing it will believe their own story. Deciding in advance removes
the opportunity rather than relying on the discipline.

### R5 — An ensemble is not automatically better than its members

A record SHOULD NOT treat aggregation as evidence of quality.

Ensembles help when their members err independently. Members that share data, features, or
assumptions err together, and averaging them reduces variance while leaving the shared bias
untouched — producing a number that is more stable and no more accurate, with a narrower spread that
now understates the real uncertainty. The aggregate looks better than any member by every internal
diagnostic, which is what makes this hard to notice.

## Prohibitions

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| cherry-pick models because they predict the desired result | [`ensemble.no-cherry-picking`](../rules/ensemble.json) | [R3](#r3--models-are-not-selected-for-producing-the-desired-answer) | no |

## Additions this standard makes beyond the source

- R1's versioning requirement and its link to silent methodology change.
- R2's treatment of weights as the quiet route to a chosen result. The source names
  `ensemble behavior` without specifying what reporting one involves.
- R3's distinction between defensible and indefensible exclusion grounds, and the observation that
  the two are indistinguishable from the outside.
- R4 in full. The source prohibits cherry-picking without addressing how it is prevented rather than
  detected, and detection is genuinely weak here.
- R5 in full — correlated errors, and why an ensemble's internal diagnostics cannot reveal them.

## Relationship to other standards

[Standard 10](10-model-disagreement.md) depends on this standard's member list, and R3 is what stops
that list from being curated into agreement.

[Standard 8](08-outliers.md) R3 is the same selection failure applied to observations rather than
models. The source names only the model version as a prohibition, so that standard states its version
as a requirement rather than inventing a second prohibition.

[Standard 1](01-probability-definition.md) R6's silent-methodology-change prohibition covers changes
to ensemble composition between records in a series: adding or dropping a member changes the method,
and doing so without declaring it is the failure that standard names.

[Standard 18](18-standards-integrity.md) shares R3's structure at the level of the standards system —
selecting the models that give the desired answer and weakening the rule that gives the desired
verdict are the same move applied to different objects.

## Implementation

Implemented by three rules in [`rules/ensemble.json`](../rules/ensemble.json), evaluated by
`scripts/records.mjs`. A fourth rule in that file,
[`ensemble.disagreement-declared`](../rules/ensemble.json), belongs to
[Standard 10](10-model-disagreement.md).

`ensemble.members-enumerated` carries `full` assurance — the fields are present or they are not.

`ensemble.aggregation-stated` carries `partial`: the evaluator reads the method that was named and
does **not** recompute the aggregate from the members. That was a deliberate choice. The space of
legitimate aggregation schemes is wider than a checker can enumerate, and a check that recomputed
only unweighted means would fail correct records using anything else — the predictable response to
which is to disable the check.

`ensemble.no-cherry-picking` carries `partial`, and its limit is the sharpest in this standard: it
can only see exclusions that were **disclosed**. A model run and silently dropped leaves no trace
anywhere in the record. A pass therefore means the declared exclusions carried reasons, never that no
cherry-picking occurred, and the rule's assurance note says exactly that. This is why R4 exists as a
process requirement — the mechanism that actually prevents the failure is not a check.

**R4 and R5 have no rules.** R4 concerns when a decision was made, which no artifact records. R5
concerns whether member errors are independent, which is not expressible in the record schema for the
same reason independence is not expressible under
[Standard 7](07-sample-size-sufficiency.md) R3.
