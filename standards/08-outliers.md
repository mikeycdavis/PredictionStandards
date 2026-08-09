# Standard 8 — Outliers

An extreme observation is either the most informative point in the sample or contamination. Which one
it is cannot be read off the value, and removing it silently is the difference between cleaning data
and shaping a result.

Source: item 8 of [`artifacts/prompt/original-prompt.md`](../artifacts/prompt/original-prompt.md).

## Requirements

### R1 — Assess whether outliers are present

Every record MUST state that outliers were looked for, and whether any were found
([`data.outliers-handled`](../rules/data.json)).

`assessed: false` is an admission rather than a pass. It records that nobody checked, which is
sometimes the truth and is always better than an unexamined `detected: false` that reads as though
someone had.

### R2 — State how detected outliers were treated

Where outliers were found, the record MUST say what was done with them
([`data.outliers-handled`](../rules/data.json)).

The realistic options are: retained unchanged, winsorised or capped, down-weighted, excluded, or
modelled separately. Any of them can be right. What the requirement targets is the unstated
exclusion — the observation that vanished between the raw data and the estimate, leaving a tighter
interval and no record that anything was removed.

### R3 — The decision must be made on grounds other than the result

An outlier MUST NOT be excluded because including it changes the answer in an unwanted direction.

The defensible reasons are about *provenance and mechanism*: the observation is a known measurement
error, it was generated under conditions that no longer apply, it belongs to a different population
than the one being predicted. The indefensible reason is that it moves the estimate. Those two can
produce identical-looking exclusions, which is why R2 asks for the reasoning rather than the action.

This is the same failure that [Standard 11](11-ensemble-behavior.md) addresses one level up: dropping
an inconvenient observation and dropping an inconvenient model are the same act performed on
different objects, and both are the source's prohibition on selecting for a desired result.

### R4 — Outliers may be the signal

A record SHOULD consider whether an extreme observation is evidence about the tail rather than an
error in the data.

In prediction work this matters more than in most statistical practice, because the events that
justify a prediction system are frequently the extreme ones. A sample cleaned of every unusual
observation produces a well-behaved model of ordinary conditions and no ability to say anything about
the conditions anyone actually needs predicted. The interval narrows, the calibration on typical days
improves, and the model becomes confidently wrong exactly when it is being relied on.

## Prohibitions

None of the source's must-never rules attach to this standard directly. R3 is the observation-level
analogue of `cherry-pick models because they predict the desired result`, which is carried by
[`ensemble.no-cherry-picking`](../rules/ensemble.json) under
[Standard 11](11-ensemble-behavior.md). It is stated here as a requirement rather than duplicated as
a prohibition, because the source's bullet names models specifically and this pack does not invent
prohibitions the source did not state.

## Additions this standard makes beyond the source

- R1's insistence that `assessed: false` is a recorded admission rather than an omission.
- R2's enumeration of treatment options. The source names `outliers` as a required standard without
  saying what handling them involves.
- R3 in full, including the observation that defensible and indefensible exclusions look identical
  from the outside, which is the reason the reasoning is what gets recorded.
- R4 in full — the argument that outliers are often the signal in prediction contexts specifically.
  The source does not address it.

## Relationship to other standards

[Standard 11](11-ensemble-behavior.md) governs the same selection failure applied to models rather
than observations, and carries the source's actual prohibition against it.

[Standard 7](07-sample-size-sufficiency.md) interacts with this standard in a way worth noting: in a
small sample, a single outlier moves the estimate substantially, so the temptation to remove it is
strongest exactly where the evidence for removing it is weakest.

[Standard 9](09-regime-change.md) supplies one of R3's few legitimate exclusion grounds — an
observation generated under a regime that no longer obtains may genuinely belong to a different
population.

[Standard 2](02-uncertainty.md) is where honest outlier retention shows up: keeping an extreme
observation widens the interval, which is the correct expression of the uncertainty it represents.

## Implementation

Implemented by one rule, [`data.outliers-handled`](../rules/data.json), evaluated by
`scripts/records.mjs`. It checks that `assessed` is present and that a `handling` description
accompanies any detection.

Assurance is `partial`, and the boundary is stark. The evaluator establishes that an assessment was
declared and that detected outliers were said to be handled somehow. It cannot establish whether the
handling was principled or convenient — which is R3, the substance of the standard — and it cannot see
observations that were removed before the record was written at all. A record describing a sample
that was quietly trimmed upstream passes cleanly.

**R3 and R4 have no rules.** Both concern why a judgement was made, and the record carries the
conclusion rather than the reasoning behind it. Neither was given a checkbox-style field: a
`justified: true` flag would be answered affirmatively by construction and would convert an open
question into a green tick, which is the specific failure this architecture is built to avoid.
