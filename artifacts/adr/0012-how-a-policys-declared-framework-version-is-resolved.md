# 0012 — How a policy's declared framework version is resolved, and what an unresolvable one does

- **Status:** Accepted
- **Date:** 2026-09-04
- **Deciders:** project owner
- **Disposes of:** the *"deliberately not decided"* section of
  [2026-08-25 policy standard-version semantics](../release-review/2026-08-25-policy-standard-version-semantics.md),
  which identified the unverified field as a cycle of its own and named itself as the evidence that
  cycle would start from. Tracked as ST-26 under FE-14 / EP-07 / IN-05.
- **Scope note.** This decides **how a declared framework version is resolved and what happens when
  it cannot be** — the semantics and their falsifiers. It does **not** implement the check; that is a
  separate story, deliberately unfiled until this document existed. It does not reopen
  [ADR 0011](./0011-what-the-report-envelope-version-promises.md)'s four version streams, does not
  move `VERSION`, and does not touch the standards or the rule catalog. The held candidates — the
  CI-teardown ownership candidate, the merge-topology convention as a written convention, the
  retroactive `v1.0.0` tag, and the stale-digest falsy read at `compliance.mjs:459` — remain held.
  Adjacency is still not evidence.

## The question

> **What does `policy.standardVersion` have to be true of before the evaluator may treat the policy
> as evaluated, and what does the evaluator do when it is not?**

[ADR 0011](./0011-what-the-report-envelope-version-promises.md) fixed four independent version
streams. The 2026-08-25 review fixed this field's *meaning* — D1 there: **the framework version the
project's predictions are evaluated against**, not an adoption date, not a pin, not a floor. Neither
answered what makes such a declaration resolvable, because nothing resolves it.

## What happens today: measured, not assumed

Every case below was run against `examples/records` with this repository's own policy, varying
**only** `standardVersion`, so the declaration is the sole independent variable.

| Declared | Meaning | Exit | Reported status | Envelope stamps |
|---|---|---|---|---|
| `1.2.0` | true — equals `VERSION` | 0 | `SUPPORTED` | `1.2.0` |
| `1.1.0` | a version that existed | 0 | `SUPPORTED` | `1.1.0` |
| `1.0.0` | the demonstrated defect | 0 | `SUPPORTED` | `1.0.0` |
| `9.9.9` | **never existed** | 0 | `SUPPORTED` | `9.9.9` |
| `0.0.1` | never existed | 0 | `SUPPORTED` | `0.0.1` |
| `1.2` | malformed | **2** | refused before evaluation | — |

Two things follow, and only one of them was expected.

**The malformed case is already correct.** The schema's semver pattern rejects it and
`predictions.mjs` exits 2 with *"A policy that cannot be read is a configuration fault, not a failing
prediction."* That is exactly the disposition this ADR would have chosen. **No work is required for
it**, and claiming otherwise would manufacture a defect to fix.

**Every other case publishes an authoritative `SUPPORTED` verdict stamped with a framework version
that was never applied — including one that has never existed.** `9.9.9` is the sharpest form of the
defect and the one that settles the argument: this is not a stale value that happens to be harmless,
it is an unverified field that will carry any string the schema's pattern admits.

### The `introducedIn` discrepancy is independently observable

Running the `1.0.0` declaration and cross-referencing every rule actually evaluated against its
`introducedIn`:

```
declared standardVersion : 1.0.0
distinct rules evaluated : 52
rules newer than declared: 2
    falsifiability.declared                       introducedIn 1.1.0
    falsifiability.resolution-not-self-determined introducedIn 1.1.0
report status            : SUPPORTED
```

The report asserts an evaluation against a framework in which two of the rules it applied did not
exist. This is measurable from data the pack already ships, without any historical catalog and
without the resolution rule below — which is what makes it usable as an *independent* check rather
than a restatement of one.

### What the pack can actually resolve against

The pack ships **exactly one catalog**, at `VERSION`. There is no mechanism to obtain a historical
one, and none is proposed here. Across that catalog, `introducedIn` takes exactly two values:

```
distinct introducedIn across the catalog : 1.0.0, 1.1.0
VERSION                                  : 1.2.0
```

## Decision

**D1 — Resolution is a bounded window, not equality.** A declared version resolves when

```
maxIntroducedIn(catalog)  <=  policy.standardVersion  <=  VERSION
```

Today that window is **`[1.1.0, 1.2.0]`**.

The upper bound says you cannot have been evaluated against a framework that does not exist yet. The
lower bound says you cannot claim a framework that lacks rules this evaluation applied. Together they
are the strongest statement derivable from what the pack ships, and they are computed rather than
configured — the window moves on its own as the catalog changes.

**D2 — Equality with `VERSION` is rejected**, and not merely because it was warned against. It is
*wrong on the evidence*: `1.2.0` added no rules, so a policy declaring `1.1.0` today makes a claim
that is true of every rule applied. Equality would call a true statement a configuration error. D1
admits it, which is the concrete sense in which legitimate historical pinning survives this decision.

**D3 — An unresolvable version is a configuration error, never a compliance failure.** It routes to
`NOT_EVALUATED` and exit 2, alongside the existing treatment of an unreadable or schema-invalid
policy. This is not a new disposition; it is the one the schema already promised, the one
`policy.mjs`'s exit contract already draws (*"Invalid configuration is a `2`, never a `1`"*), and the
one [ADR 0010](./0010-the-aggregate-status.md) already ranks first in `AGGREGATE_PRECEDENCE` on the
grounds that it is the absence of a verdict rather than a milder one.

**D4 — The lower bound is catalog-wide, not per-run.** Deriving it from the rules a particular run
happened to evaluate would make a policy's validity depend on which records it was pointed at, so the
same policy would resolve against one target and not another. Resolvability is a property of the
policy and the pack, and must be answerable without a target.

**D5 — The per-run `introducedIn` check is retained as an independent falsifier, not as the rule.**
For every rule actually evaluated, `introducedIn <= declared` must hold. Under D1 this is implied —
which is exactly why it is worth measuring separately: it is a second measurement of the same
property by a different route, and it fails loudly if the D1 window is ever computed wrongly. Two
routes to one verdict would be two evaluators; two routes to one *check* is a cross-check.

**D6 — Narrowing the catalog to the declared version is rejected.** It would require historical
catalogs the pack does not ship, and it is under-declaration in the form this repository already
refuses elsewhere: silently dropping rules so that a claim becomes true is the mechanism by which a
policy stops meaning anything.

**D7 — The three adoption archives are untouched and out of scope.** Measured: nothing outside
`artifacts/` references `artifacts/adoption/*project-policy.yml`; they are never live evaluator
input. They are frozen evidence of what was evaluated on a particular day, and the 2026-08-25 review
already ruled that rewriting them would destroy the record they exist to keep.

## The consequence that was not anticipated

ST-26 recorded the risk to the pack's evidence base as the adoption archives. **That was the wrong
target.** The archives are inert. The live constraint is the test fixtures:

```
12 of 13 policies under test/fixtures/policies/ declare standardVersion "1.0.0"
```

Those are real evaluator inputs, exercised by the suite on every run, and `1.0.0` is below the D1
lower bound. Under this decision they become configuration errors.

**That is the correct reading, not a problem with the decision.** Their `1.0.0` is boilerplate nobody
revisited — the same defect this ADR exists to close, at fixture scale, and the fixtures are subjects
of tests about exceptions, parameters and canonical ids, not about versioning. Migrating them is
implementation work and belongs to the implementation story, which must treat the migration as part
of the change rather than as incidental cleanup.

This is recorded here because it changes the size of the implementation, and because a decision whose
first consequence is discovered during implementation is a decision that was not finished.

## Acceptance criteria — the falsifiers

Each states the observation that would show the decision wrong, red-first: the observation must be
constructed and seen to fail before the check exists.

| # | Case | Required outcome | Falsifier |
|---|---|---|---|
| A1 | Current self-policy, `1.2.0` | resolves; evaluation proceeds | it does not resolve, or the window rejects `VERSION` itself |
| A2 | Legitimate pin, `1.1.0` | **resolves** | it is rejected — equality has crept back in |
| A3 | Stale, `1.0.0` | `NOT_EVALUATED`, exit 2 | a verdict is published, or it is reported as a compliance failure |
| A4 | Future, `9.9.9` | `NOT_EVALUATED`, exit 2 | `SUPPORTED` is published, as it is today |
| A5 | Malformed, `1.2` | refused at load, exit 2 | behaviour changes from what is measured above |
| A6 | `introducedIn` cross-check | every evaluated rule satisfies `introducedIn <= declared` | a rule newer than the declared version is applied under a resolved policy |
| A7 | Window is computed | changing the catalog's max `introducedIn` moves the lower bound | the bound is a literal anywhere in the source |
| A8 | Disposition is not a failure | the outcome is `NOT_EVALUATED`, never `INSUFFICIENTLY_SUPPORTED` | it appears as a rule finding or reaches exit 1 |

A2 and A8 are the two that matter most: A2 is the constraint this decision was explicitly told not to
foreclose, and A8 is the distinction the whole exit contract rests on.

## Held items, untouched

Restating the scope note because an accepted ADR is exactly when adjacent work starts looking
authorized. None of the following is promoted, started, or made more likely by this decision: the
CI-teardown ownership candidate, the non-squash merge-topology convention as a written convention,
the retroactive `v1.0.0` tag, or the stale-digest falsy read at `compliance.mjs:459`. Each remains
held until it independently earns entry on its own evidence.
