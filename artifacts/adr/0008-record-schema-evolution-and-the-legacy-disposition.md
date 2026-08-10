# 0008 — Record schema evolution: additive fields, version gating in the evaluator, and `not-evaluated` for legacy records

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

Candidate C2 of the [v1.1 evidence review](../release-review/v1.1-evidence-review.md) adds a
requirement that a prediction declare that its outcome was **undetermined at `generatedAt`**. That
declaration has to live somewhere in the record, and every record written against record schema
1.0.0 predates it.

This is the first time the record schema has had to change, so the mechanism chosen here sets the
precedent for every later change. Two things pull against each other:

- **Backward-compatible evolution** is a repository requirement. Inserting a new required field into
  the 1.0.0 shape would make every existing record fail `record.schema-valid`, which is a
  configuration-class failure — exit 2, `NOT_EVALUATED` — so an entire corpus would stop being
  *readable*, not merely stop being supported.
- **Compatibility must not weaken the standard.** The owner stated the constraint exactly: *an old
  record accepted as old-format does not have to mean an old record automatically satisfies the new
  falsifiability rule.* Those are separate questions, and the obvious compatibility mechanisms
  answer the first in a way that silently answers the second.

The failure mode to avoid is concrete. If legacy records are exempted from the new rule, they
`pass` it. A corpus of a thousand 1.0.0 records would then report full support for a property
nothing examined — the false green this pack was built to prevent, arriving through the back door of
a compatibility decision.

## Decision

Four parts.

**1. New record fields are additive and optional in the schema. The record schema goes to 1.1.0.**

`subject.falsifiability` is an optional object. A record declaring `schemaVersion: "1.0.0"` and a
record declaring `"1.1.0"` are both well-formed documents. `record.schema-valid` behaves identically
for both, and no existing record becomes unreadable.

**2. Version discrimination lives in the evaluator, not in the schema.**

The rule `falsifiability.declared` requires the declaration for records at schema **1.1.0 or later**.
The gate is one documented comparison in `scripts/records.mjs`, not a branch in the schema.

The alternative — a top-level `oneOf` discriminated on `schemaVersion` — was rejected. It duplicates
the whole record shape per version, so every future field edit has to be made twice and the two
copies drift exactly as the three-way separation exists to prevent. It also puts a *standards*
question (what a supported prediction must declare) inside the artifact that answers a *format*
question (what a well-formed document looks like), which conflates exit 2 with exit 1. A record
missing its falsifiability declaration is not malformed. It is insufficiently supported, and the
verdict should say so.

**3. A legacy record's disposition for the new rule is `not-evaluated`, never `passed`.**

This is the load-bearing half of the decision. A 1.0.0 record cannot carry the declaration, so the
evaluator reports, per record:

```text
not-evaluated  falsifiability.declared: This record declares schema version 1.0.0, which has no
               field for a falsifiability declaration. Whether its outcome was undetermined at
               generation is unknown to this evaluation.
```

`skipped ≠ passed` is the pack's founding distinction, and this is exactly the case it was built
for. The verdict does not degrade — a legacy corpus keeps the verdicts it had — while
`frameworkCoverage` and `status` both show the rule as unevaluated for those records. The pack says
what it does not know instead of assuming the answer in either direction.

This required one small extension to the evaluator: a per-record `not-evaluated` disposition,
alongside the per-record `not-applicable` disposition ADR 0005 introduced. They are different
claims. *Not applicable* says the rule has no subject in this record. *Not evaluated* says the rule
has a subject and this evaluation could not reach it. Collapsing the two would have let a
compatibility gap masquerade as an inapplicable rule, which is R1's error — a disposition asserting
more than was observed — at the level of a mechanism rather than a sentence.

**4. Pinning an old schema version to avoid a rule is a Standard 18 manipulation.**

The declared record schema version is chosen by the producer, so a producer could hold records at
1.0.0 indefinitely and keep the rule permanently unevaluated. That route is not closed
mechanically, because the evaluator cannot tell a genuinely old record from a new one wearing an old
version. It is closed normatively: Standard 19 states that declaring a superseded record schema
version in order to avoid a requirement is bypassing a standard because it prevents a desired
conclusion, which is precisely what the standards-integrity invariant forbids. The cost of the route
is also visible rather than hidden — every such record reports `not-evaluated` in `status` and drags
`frameworkCoverage` down, so a corpus taking it advertises that it is doing so.

## Consequences

- Every v1.0.0 record remains valid, readable, and evaluable. No verdict changes for an unmodified
  corpus.
- No legacy record is credited with satisfying a requirement that nothing examined.
- Adopters upgrade per record rather than per corpus: raise `schemaVersion` to `1.1.0`, add the
  declaration, and the rule starts being evaluated for that record. There is no migration script and
  none is needed, because nothing has to be rewritten to stay valid.
- The precedent for future record schema changes is set: **additive and optional in the schema,
  required by a rule at a stated version, `not-evaluated` below it.** A change that cannot be
  expressed additively is a major version of the record schema and needs its own decision.
- `frameworkCoverage` becomes a mixed-corpus number. A directory holding both 1.0.0 and 1.1.0
  records reports partial evaluation of `falsifiability.declared`, which is the truth about that
  directory.
- The evaluator carries a version comparison it did not have before. It is one function with one
  caller, and the version it compares against is a named constant rather than a literal, so the next
  gated field does not reintroduce the same parsing.
