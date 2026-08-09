# Standard 5 — Data Freshness

Using old data is often unavoidable and frequently fine. Using it as though it were current is not,
and the difference is one sentence in the record.

Source: item 5 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Requirements

### R1 — State when the data was current

Every record MUST state the instant its underlying data describes, and SHOULD state the window within
which that data remains usable for this kind of prediction
([`data.freshness-declared`](../rules/data.json)).

The critical distinction is between **when the data was fetched** and **when the data was current**.
A feed pulled a minute ago may carry figures from last quarter. The record schema asks for
`dataAsOf` — the instant the content describes — precisely because the fetch time is the number
systems find easiest to record and the one that hides the problem. `provenance.dataSources[].retrievedAt`
holds the fetch time separately, so both are available and neither is mistaken for the other.

Where no `freshnessWindow` is given, the project's `parameters.defaultFreshnessWindow` applies. The
evaluator reports which value it used, so a verdict never rests on an unstated threshold.

### R2 — Stale information is never used as though it were fresh

**Never**, reproduced verbatim from the source:

```text
use stale information without accounting for staleness
```

Where the data is older than its freshness window at the moment the prediction was generated, the
record MUST state how that age was allowed for
([`data.staleness-accounted`](../rules/data.json)).

Note what this does *not* say. It does not prohibit stale data, set a maximum age, or require a
refresh. Fresh data is often unobtainable, and a prediction from month-old figures may be the best
available and perfectly honest. What it prohibits is the silent version — using month-old figures
while presenting an interval as narrow as fresh ones would justify.

Accounting for staleness usually means one of: widening the interval, decaying the weight on older
observations, shortening the prediction's own expiry, or lowering the confidence tier. Any of these
is acceptable. Saying which one was done is the requirement.

### R3 — The freshness window should reflect how fast the subject moves

A project SHOULD choose freshness windows from the dynamics of what is being predicted rather than
from the convenience of its data pipeline.

Server-load predictions go stale in hours; predictions about demographic trends do not go stale in
months. A single global window applied to both will be far too lax for one and needlessly strict for
the other, and the lax direction fails silently.

This is a SHOULD because the correct window is a domain judgement no standard can supply. It is worth
stating because the mechanism in R2 is only as good as the window it is measured against — a
generous window makes stale data pass, which is why the window belongs in a reviewed policy rather
than in a record that can set its own.

## Prohibitions

| Prohibition | Rule | Requirement | Non-exemptible |
|---|---|---|---|
| use stale information without accounting for staleness | [`data.staleness-accounted`](../rules/data.json) | [R2](#r2--stale-information-is-never-used-as-though-it-were-fresh) | no |

## Additions this standard makes beyond the source

- R1's separation of `dataAsOf` from `retrievedAt`. The source says nothing about which timestamp is
  meant, and the distinction is where most of the failures live.
- The list of acceptable ways to account for staleness under R2. The source requires accounting
  without saying what would constitute it.
- R3 in full, including the observation that a generous window silently defeats R2.
- The decision that the freshness window lives in project policy rather than being fixed by the
  standard. No number in the source could have supplied it.

## Relationship to other standards

[Standard 13](13-prediction-expiration.md) is the same concern pointed the other way: this standard
governs how old the *inputs* may be, that one governs how long the *output* stays valid. A prediction
built on data at the edge of its freshness window should generally not have a long expiry, since its
evidence is already aging.

[Standard 9](09-regime-change.md) is the reason staleness is not merely a matter of degree. Data from
before a regime change is not slightly less relevant; it may describe a system that no longer exists.

[Standard 17](17-abstention.md) is the escape route when the data is too old to account for honestly:
`stale-data` is one of the coded abstention reasons, and
[`abstention.no-manufactured-prediction`](../rules/abstention.json) treats unaccounted staleness as
one of the four conditions under which a prediction should not have been issued at all.

[Standard 3](03-calibration.md) R2 concerns a related error in the opposite temporal direction: using
data from *after* the prediction point rather than from too long before it.

## Implementation

Implemented by two rules in [`rules/data.json`](../rules/data.json), evaluated by
`scripts/records.mjs` with all arithmetic performed against the run's `--as-of` instant so that
evaluations are reproducible.

`data.freshness-declared` carries `full` assurance — the timestamp is either present or it is not.

`data.staleness-accounted` carries `partial`, and the gap is worth being explicit about: the evaluator
establishes that an accounting was *written* once the data passed its window. It cannot establish
that the accounting was adequate to the age, and it cannot see a window set generously enough that
genuinely stale data never trips the check at all. Both limits are in the rule's assurance note.

**R3 has no rule.** Whether a project's freshness windows suit its subject matter is a judgement about
the domain, and the evaluator has no access to it.
