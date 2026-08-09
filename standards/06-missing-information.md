# Standard 6 — Missing Information

An empty list of gaps is a claim that somebody looked. Silence is not, and a reader cannot tell the
two apart unless the record makes the distinction itself.

Source: item 6 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Requirements

### R1 — Declare what is known to be missing

Every record MUST list what is known to be missing, separating gaps judged immaterial from
information judged critical ([`data.completeness-declared`](../rules/data.json)).

The separation is the substance of this requirement. Every dataset has gaps, and a record that listed
all of them without distinction would be unreadable. What matters is which ones bear on the outcome:

- **known gaps** — absences that were noticed and judged not to change the answer;
- **critical missing** — absences that bear materially on the outcome.

An empty `criticalMissing` array is a real statement, and it should be written deliberately rather
than arrived at by omitting the field. This is why both arrays are required by the schema.

### R2 — Missing critical information is never ignored

**Never**, reproduced verbatim from the source:

```text
ignore missing critical information
```

Where information the record itself classifies as critical is missing, a prediction MUST justify why
it is defensible anyway, or give way to an abstention
([`data.missing-critical-blocks`](../rules/data.json)).

The force of this rule comes from the record having already conceded the point. Classifying something
as critical is saying it bears materially on the outcome; predicting anyway without a word about it
is the moment a system starts manufacturing confidence it has already admitted it lacks.

A justification is not a formality. It should say why the prediction survives the gap — the missing
factor cuts both ways, or its plausible range does not move the estimate past a decision boundary, or
another source substitutes for it. "Best available estimate" is not a justification; it is a
restatement of the problem.

### R3 — Distinguish missing from absent

A record SHOULD distinguish information that exists but was not obtained from information that does
not exist.

These look identical in a gap list and behave differently. Data that exists but was not obtained is a
work item: someone can go and get it, and the prediction can be revised. Data that does not exist —
because the event is novel, or the measurement was never taken — is a permanent condition of the
problem, and no amount of effort will close it.

The practical consequence is what happens next. The first case argues for delaying the prediction;
the second argues for a wider interval and a lower confidence tier, permanently. Recording them the
same way loses that distinction.

### R4 — Unknown unknowns are outside what any of this can reach

A record's gap list covers what somebody noticed was missing. It cannot cover what nobody thought to
look for, and no requirement in this standard should be read as implying otherwise.

This is stated as a requirement rather than a footnote because the confusion is consequential: a
record that passes every rule here has demonstrated that its *declared* gaps were handled, and a
reader who takes that as evidence of completeness has drawn precisely the wrong conclusion. The rules
carry `partial` assurance for this reason and their notes say so.

## Prohibitions

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| ignore missing critical information | [`data.missing-critical-blocks`](../rules/data.json) | [R2](#r2--missing-critical-information-is-never-ignored) | no |

## Additions this standard makes beyond the source

- R1's split between immaterial gaps and critical absences, and the requirement that both be written
  deliberately. The source names `missing information` as a standard and prohibits ignoring the
  critical kind, without saying how the two are distinguished or recorded.
- R2's account of what does and does not constitute a justification.
- R3 in full — the distinction between unobtained and non-existent information, and the different
  responses each warrants. The source does not address it.
- R4 in full. The source does not discuss the limits of a declared gap list, and this pack's whole
  approach to assurance makes stating those limits obligatory.

## Relationship to other standards

[Standard 17](17-abstention.md) is the alternative R2 depends on. Requiring a justification is only
reasonable because declining to predict is a supported outcome —
`missing-critical-information` is one of the coded abstention reasons, and
[`abstention.no-manufactured-prediction`](../rules/abstention.json) treats an unjustified critical gap
as one of the four conditions under which a prediction should not have been issued.

[Standard 5](05-data-freshness.md) covers a specific kind of incompleteness: the information exists
and is held, but describes an earlier state of the world.
[Standard 7](07-sample-size-sufficiency.md) covers another: nothing is missing from the record, there
is simply not enough of it.

[Standard 16](16-confidence-definitions.md) is where R3's permanent gaps should show up — a project's
confidence definitions are the natural place to require that unresolvable absences cap the tier.

## Implementation

Implemented by two rules in [`rules/data.json`](../rules/data.json), evaluated by
`scripts/records.mjs`.

Both carry `partial` assurance, and the reason is the same in each case and worth stating plainly:
these rules act on the record's *own classification*. A record that quietly files decisive
information under `knownGaps` rather than `criticalMissing` passes both. So does a record whose
author never noticed the gap at all.

That is not a defect to be fixed by a better checker — the classification is a judgement, and no
structural check can second-guess it. It is a boundary, and the honest response is to state it in the
assurance notes and to resist reporting these rules as though they establish completeness.

**R3 and R4 have no rules.** R3 has no field in the record schema to check, and adding one that could
be filled in without thought would create the appearance of a distinction rather than the substance
of one. R4 is not checkable by construction.
