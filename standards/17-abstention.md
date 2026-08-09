# Standard 17 — Abstention

Every other standard in this pack asks a prediction to be supported. This one provides the answer
when it cannot be: declining to predict is a valid output, and preferring it to unjustified certainty
is the point of the whole system.

Source: item 17 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Scope

Applies to every record and to the systems that produce them. This standard carries the first
prohibition in the source's list, and it is the one the others depend on: forbidding fabricated
probabilities, unjustified gaps, and manufactured confidence is only reasonable if there is somewhere
else to go.

## Requirements

### R1 — Abstention is a first-class output

The output format MUST admit an abstention on equal footing with a prediction
([`abstention.first-class-output`](../rules/abstention.json)).

The source is explicit that valid prediction outputs must include the possibility, reproduced
verbatim:

> NO PREDICTION / INSUFFICIENT EVIDENCE

A system whose output format has no way to say this forces a number in every case, and the numbers it
forces are precisely the ones least supported by evidence. Making abstention *representable* is the
precondition for everything else here — a prohibition with no available alternative is a prohibition
that gets violated.

In this pack, `output` is a discriminated union: `type: "prediction"` and `type: "abstention"` are
peers in the schema, not a value and an error state.

### R2 — An abstention states the standard wording and its reasons

An abstention MUST carry the fixed statement above, at least one coded reason with detail, and no
probability, edge, or expected value ([`abstention.valid-shape`](../rules/abstention.json)).

The wording is fixed so that abstention is recognisable mechanically and cannot be softened into
something that reads like a weak prediction. "We think it's probably around 60 percent but we're not
confident" is not an abstention; it is a prediction with a disclaimer, and it will be quoted without
the disclaimer.

The reasons are what make an abstention useful rather than a shrug. The coded reasons —
`insufficient-evidence`, `stale-data`, `missing-critical-information`, `sample-too-small`,
`regime-change`, `model-disagreement`, `other` — map onto the conditions the other standards detect,
so an abstention becomes a work item: *this* is what was missing, and obtaining it would let a
prediction be made.

### R3 — A prediction is never manufactured when the evidence is insufficient

**Never**, reproduced verbatim from the source:

```text
manufacture a prediction when evidence is insufficient
```

A prediction MUST NOT be issued while the record's own declarations show the evidence is
insufficient ([`abstention.no-manufactured-prediction`](../rules/abstention.json), non-exemptible).

The rule aggregates four conditions, each of which is the record admitting a specific inadequacy:

| Condition | Declared by | Standard |
|---|---|---|
| critical information missing without justification | `data.completeness.criticalMissing` | [6](06-missing-information.md) |
| data past its freshness window without accounting | `data.freshness` | [5](05-data-freshness.md) |
| sample below the project minimum without justification | `data.sampleSize` | [7](07-sample-size-sufficiency.md) |
| ensemble disagreement above threshold, undeclared | `ensemble.disagreement` | [10](10-model-disagreement.md) |

Each is available in the record because another standard required it to be declared. This rule is
where those declarations are read together and turned into a single question: given what this record
says about itself, should it be making a prediction at all?

### R4 — Prefer abstention over unjustified certainty

Where the evidence does not support a prediction, a system SHOULD abstain rather than produce a
hedged one.

The source states the preference directly: the system should prefer abstention over unjustified
certainty. The failure mode this guards against is the middle path — a probability near 0.5 with a
wide interval and a low confidence tier, technically defensible and practically useless. It looks
like caution and functions like a prediction, because downstream consumers extract the number and
discard the caveats.

The distinction worth holding: a genuine 0.5 with a wide interval is a real finding, and it says the
evidence points both ways. An abstention says something different — that the evidence is not
sufficient to say even that. Collapsing the two loses information.

### R5 — Abstention is a supported outcome, not a failure

A well-formed abstention MUST be capable of reaching the highest verdict the system can assign.

This is the requirement that makes the rest of the standard credible. If abstaining scored worse than
predicting, every incentive in the system would push toward manufacturing a number, and R3 would be
asking people to accept a penalty for honesty.

In this pack, an abstention record with valid shape and complete provenance reaches `SUPPORTED` —
the same verdict a well-evidenced prediction reaches. Prediction-only rules are reported
`not-applicable` with the reason stated, never as failures and never as silent passes.

### R6 — Abstention is not a refuge from difficulty

Abstention SHOULD NOT be used to avoid a prediction the evidence would support.

The mirror of R4, and the reason R2 requires reasons. A system that abstains whenever a question is
hard is as useless as one that always predicts, and it is harder to criticise because every
individual abstention looks prudent. Requiring a coded reason that maps to a specific inadequacy
makes an unfounded abstention as visible as an unfounded prediction: if none of the conditions
applies, the abstention has to say `other` and explain itself.

## Prohibitions

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| manufacture a prediction when evidence is insufficient | [`abstention.no-manufactured-prediction`](../rules/abstention.json) | [R3](#r3--a-prediction-is-never-manufactured-when-the-evidence-is-insufficient) | yes |

## Additions this standard makes beyond the source

- R2's fixed wording as a mechanical requirement, the coded reason vocabulary, and the prohibition on
  carrying prediction-only fields. The source supplies the statement text and requires that the
  possibility exist, without specifying what a well-formed abstention contains.
- R3's four aggregated conditions. The source prohibits manufacturing a prediction without saying how
  insufficiency is recognised; these are drawn from what the other standards already require records
  to declare.
- R4's argument against the hedged middle path, and the distinction between a genuine 0.5 and an
  abstention.
- R5 in full. The source says abstention should be preferred; making it reach the same verdict as a
  supported prediction is this pack's mechanism for meaning it.
- R6 in full — the source does not address over-abstention, and a standard that only pushed one
  direction would be incomplete.

## Relationship to other standards

Every standard that permits a justification depends on this one for its alternative:
[6](06-missing-information.md) R2, [5](05-data-freshness.md) R2, [7](07-sample-size-sufficiency.md)
R2, [9](09-regime-change.md) R2, and [10](10-model-disagreement.md) R2 all name abstention as an
acceptable response, and R3 here reads their declarations back.

[Standard 1](01-probability-definition.md) R5's prohibition on fabricated probabilities is only a
reasonable demand because of R5 here. The same holds for
[Standard 16](16-confidence-definitions.md) R4.

[Standard 16](16-confidence-definitions.md) sits directly above this standard: abstention is the floor
below the lowest confidence tier. When the evidence does not support even the weakest tier, the
answer is not a low-confidence prediction.

[Standard 18](18-standards-integrity.md) shares R5's logic one level up. Both make refusal a
first-class outcome — abstention when the evidence is insufficient, `BLOCKED_BY_INVARIANT` when
proceeding would require manipulating the standards themselves. Neither is a failure state, and
neither can be forced into a positive recommendation.

## Implementation

Implemented by three rules in [`rules/abstention.json`](../rules/abstention.json), evaluated by
`scripts/records.mjs`.

`abstention.first-class-output` and `abstention.valid-shape` carry `full` assurance: the fixed
statement is a schema `const`, and the union rejects cross-variant fields outright.

`abstention.no-manufactured-prediction` carries `partial`, and this is the most important assurance
note in the pack. The rule aggregates conditions the record **declares about itself**. A record that
understates its own gaps — filing decisive information under `knownGaps`, or setting a generous
freshness window — passes it while violating everything it stands for. It catches the honest failure,
not the motivated one.

That limit is not fixable by a better check, because every input to it is a judgement the record
author made. It is why [Standard 18](18-standards-integrity.md) exists: the remaining defence against
motivated under-declaration is that manipulating the declarations to reach a desired conclusion is
itself the thing most explicitly forbidden.

**R4 and R6 have no rules.** R4 would require judging whether a hedged prediction should have been an
abstention, and R6 the reverse — both are judgements about a prediction that was not made. R1 is
verified against the schema itself rather than against any individual record, since it is a property
of the format.
