# The `--json` report, and what its status does not tell you

This is the interface a machine consumer integrates against. It is written for someone wiring
`predictions check --json` into a gate and who will never read an ADR, so the assurance boundary is
stated here rather than only in [ADR 0010](../artifacts/adr/0010-the-aggregate-status.md).

## Shape

```
{
  "schemaVersion": "1.1.0",
  "command":       "check",
  "policy":        "project-policy.yml",       // or null when none was found
  "asOf":          "2026-08-09T12:00:00Z",
  "parameters":    { ... },                    // thresholds the policy set
  "status":        "SUPPORTED",                // check only — see below
  "records":       [ { "file": ..., "status": ..., ... } ],
  "aggregate":     { "supported": 20, "insufficientlySupported": 26, ... }
}
```

## What the version promises

The shape above is defined by [schemas/report.schema.json](../schemas/report.schema.json), and the
version says what you may rely on across releases. Given `schemaVersion` `M.m.p`:

**You may assume** every key documented at the same major and any minor at or below `m` is present,
with the documented type and the documented meaning.

**You may not assume** that no *other* key is present. Absence is never promised, and a key that was
sometimes missing may become always present without a major bump — `records[].status` did exactly
that in `1.1.0`. Parse tolerantly, and do not treat an unfamiliar key as a malformed document.

**A different major is not partially readable.** Fail closed rather than best-effort a document you
do not understand.

How the number moves:

| Change | Bump |
|---|---|
| A key is added, optional or always present | minor |
| A sometimes-absent key becomes always present | minor |
| A documented key is removed, renamed, or retyped | **major** |
| A documented key keeps its shape and changes its **meaning** | **major** |
| A sixth `status` value is added | **major** |
| A new subcommand emits this envelope | minor |

`status`'s five values are a **closed** set: a sixth would make this pack unreadable to every
StandardsEnforcer holding the current `standards-adapter.json`, which fails closed on a status its
adapter does not declare. `command`'s values are **open** — do not enumerate them.

**Where the contract stops, deliberately.** `parameters` is defined by
[schemas/project-policy.schema.json](../schemas/project-policy.schema.json), and the entries of
`records[].results[]` follow the rule catalog, which moves on the standards' cycle rather than this
one. Both are typed in the schema and not enumerated, so nothing above governs their keys. Per-rule
detail is an unversioned surface; read it, but do not build a gate on its shape.

This is the consumer-facing half of
[ADR 0011](../artifacts/adr/0011-what-the-report-envelope-version-promises.md).

**`predictions policy --json` is not this document.** Its `status` is `ok`/`findings`/`invalid` —
a different question with a different vocabulary — and it carries no `schemaVersion`, because it is
under no contract. Never wire it to a gate expecting a verdict.

## The four channels, and why none substitutes for another

| Field | Answers | Do not use it for |
|---|---|---|
| `status` | what single authoritative disposition holds over this checked set? | finding out what was wrong |
| `aggregate` | how many records landed in each disposition? | the verdict |
| `records[].assurance`, `frameworkCoverage` | how much of the framework was actually in play? | either of the above |
| exit code | did the command run, and did it find something? | the verdict — it is a lossy projection |

## `status` — the authoritative disposition

Present on `check` only. `audit`, `explain` and `status` reach no verdict by design, and the key is
deliberately absent from their output — do not treat its absence there as a result.

It is the strongest disposition observed across the set, worst first:

```
any record NOT_EVALUATED             → NOT_EVALUATED
else any BLOCKED_BY_INVARIANT        → BLOCKED_BY_INVARIANT
else any INSUFFICIENTLY_SUPPORTED    → INSUFFICIENTLY_SUPPORTED
else any SUPPORTED_WITH_EXCEPTIONS   → SUPPORTED_WITH_EXCEPTIONS
else                                 → SUPPORTED
```

Each is a **some**-quantifier over records. `BLOCKED_BY_INVARIANT` means at least one record is
blocked, not that all are. It is recomputable from `records[].status` alone, so you can check our
arithmetic.

`NOT_EVALUATED` leads because it is not a milder verdict than blocked — it is the absence of one. If
any record produced no verdict, the set cannot honestly claim a complete disposition, so it does not.

## What you may not infer from it

**The status is not a summary of findings.** No subordinate outcome follows from it in either
direction.

| Tempting inference | True? | Read instead |
|---|---|---|
| `NOT_EVALUATED` → no invariant violations were observed | **No** | `aggregate.blockedByInvariant` |
| `NOT_EVALUATED` → nothing was evaluated | **No** | the counts; most records may carry full verdicts |
| `SUPPORTED` → every applicable rule passed | **No** | `records[].assurance.notEvaluated` |
| `SUPPORTED` → every record was fully evaluated | **No** | `frameworkCoverage` |
| `BLOCKED_BY_INVARIANT` → every record is blocked | **No** | `aggregate`, and `records[].blockedBy` |
| `SUPPORTED_WITH_EXCEPTIONS` → every record carried an exception | **No** | the per-record reports |
| no `status` key → nothing was wrong | **No** | see *No status without records* |

The case worth stating on its own, because it is the one that looks like a bug: **five blocked
records plus one unreadable file reports `NOT_EVALUATED`.** Nothing is hidden —
`aggregate.blockedByInvariant` is `5` and each blocked record names its rules in `blockedBy`. The
top-level field is answering a different question, and the unreadable member prevents a total
judgement over the set.

A rule that nothing evaluated is reported as not-evaluated, never as a pass. So **`SUPPORTED` does
not imply every applicable rule passed** — it means every rule that *was* evaluated passed, and the
rules nothing reached are counted separately in `assurance.notEvaluated`. That is the oldest
commitment in this pack, and it survives aggregation unchanged.

## A verdict is valid as of an instant, not as of a commit

**This is the one that bites consumers who cache.** The status is a function of the corpus **and the
clock**, not of the tree alone. Exceptions and attestations carry `expires`, compared against `asOf`
— which defaults to now. So an unchanged corpus at an unchanged commit can move from `SUPPORTED` to
`INSUFFICIENTLY_SUPPORTED` with no edit to any file, the day an exception lapses. That is deliberate:
an exception past its expiry is a compliance failure, not a resolution.

So the claim this report supports is not:

> PredictionStandards reported `SUPPORTED` for commit X.

It is:

> PredictionStandards reported `SUPPORTED` for commit X **as of time T**, under the policy and
> evidence current at that evaluation.

If you retain a verdict, retain `asOf` beside it, and do not key it on commit SHA alone. Pass
`--as-of=<ISO>` to make a run reproducible.

`--as-of` is **normalised on accept**: any instant `Date.parse` understands is converted to UTC with
`new Date(value).toISOString()` before anything reads it. An offset-bearing argument is therefore
accepted and evaluated as the instant it names, not as the day its text begins with, and the value
echoed back is always the canonical `Z` form the schema pins. Equivalent instants spelled
differently produce identical reports, byte for byte.

## No status without records

An empty target is a configuration fault, not a domain result: the command exits 2 and writes **no
JSON at all**. There is no envelope carrying `"status": "NOT_EVALUATED"` and zero records, because
that would assert that some subject was examined and found unevaluable. No subject was supplied.

The same holds for every command-level failure — an unknown flag, an unparseable `--as-of`, an
invalid policy document. They prevent the status existing rather than overriding it. **A status is
never manufactured out of a configuration failure.**

An unreadable *record* is different: it is inside the set, it reports
`{ "status": "NOT_EVALUATED", "parseError": "..." }`, and it counts toward `aggregate.notEvaluated`.

## Exit codes

A lossy projection of the status, kept for shell callers. Do not read a verdict from it.

| Exit | Meaning | Statuses |
|---|---|---|
| `0` | passing | `SUPPORTED`, `SUPPORTED_WITH_EXCEPTIONS` |
| `1` | findings | `INSUFFICIENTLY_SUPPORTED`, `BLOCKED_BY_INVARIANT` |
| `2` | could not evaluate, or could not run | `NOT_EVALUATED`, and every configuration fault |

Exit `1` does not distinguish blocked from insufficiently supported, and exit `2` does not
distinguish a not-evaluated corpus from a bad invocation. `status` does; that is what it is for.
