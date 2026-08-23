# Finding — the report envelope is versioned but has no contract

- **Raised:** 2026-08-16, during the ADR 0010 aggregation cycle
- **Status:** Dispositioned, 2026-08-23, by
  [ADR 0011](../adr/0011-what-the-report-envelope-version-promises.md) — the envelope version
  describes backward-compatible shape, `status` is additive and earns a minor bump, `"1.0"` becomes
  `"1.1.0"`, and a report schema is required rather than deferred. The four questions below map to
  its D1/D6, D4, D2/D3 and D3. **Nothing is implemented yet**; the ADR carries the consequences.
- **Deliberately not fixed in:** the ADR 0010 implementation

## The finding

The larger statement, which is what makes this worth its own record:

> **PredictionStandards publishes a versioned JSON envelope without a defined or validated envelope
> contract.**

Not "should this field become `1.1`?" A version string with no schema and no compatibility promise is
metadata without enforceable semantics — it looks like a contract to a consumer and constrains
nothing on the producer.

## Evidence

1. **No schema exists for the envelope.** `schemas/` contains `prediction-record.schema.json` and
   `project-policy.schema.json`. Nothing describes the `--json` report.
2. **The version is a bare literal.** `"schemaVersion": "1.0"` is written in `envelope()` in
   `scripts/compliance.mjs` and validated by nothing. Its only documentation is that function's
   docstring, which says it "versions this format independently of the standards version and the
   record schema version" — a statement about what it is *not* tied to, not about what it promises.
3. **The two version strings are not even the same shape.** The record schema uses semver
   (`"1.0.0"`); the envelope uses `"1.0"`. Nothing explains the difference.
4. **The pack's own precedent argues for a bump.** ADR 0008 gave an *optional, additive* record field
   (`subject.falsifiability`) a minor bump, 1.0.0 → 1.1.0. The `status` key added by ADR 0010 is
   additive but **always present** on `check` — strictly more visible than the change that already
   warranted a bump there.
5. **The "breaking for strict validators" concern has no current instance** — no validator can exist
   without a schema. That is the weaker position, not the safer one: the version currently promises
   whatever the next reader assumes.

## What this cycle did, and did not do

The ADR 0010 work **added the `status` key and left `schemaVersion` at `"1.0"`**. That is a holding
position, not a decision, and it is recorded here so it cannot pass for one.

It was left alone deliberately. Answering it properly means deciding what the envelope's version
promises, which is a compatibility-policy question the pack has never answered — and answering it
inside an aggregation ADR would have expanded the cycle from *publish the missing authoritative
status* into *design the report-envelope versioning system*. That expansion is exactly what the
narrow-cycle discipline exists to prevent.

## What a disposition has to decide

1. What does the envelope's `schemaVersion` promise — exact shape, additive-compatible, or nothing?
2. Does a schema exist for it, and is it validated in CI as the record and policy schemas are?
3. Does adding `status` warrant `"1.1"` under whatever answer (1) gives?
4. Why does it use `"1.0"` where the record schema uses `"1.0.0"` — reconcile or explain.

Question 3 is the one that surfaced this, and it is the least important of the four.

## Bounds

- **Due before the next release**, because that release is what would publish `status` under an
  unexamined version string to an external consumer.
- **Not a blocker for the adapter contract.** `standards-adapter.json` declares the pack's status
  vocabulary and invocation; it does not reference the envelope version.
- Nothing here reopens ADR 0010. The aggregation semantics stand on their own.

## Why this is filed here

Because the disposition is due before the next release, and that is what this directory holds.

Correcting the rationale given when it was first committed: that commit message said the backlog
tracker could not be regenerated from this repository, so an item would have desynchronised a
generated file "with no path back". The first half is true — there is no `scripts/backlog.mjs` here
and no `backlog` entry in `package.json` — but the conclusion was wrong. The generator lives in the
`backlog-validate` skill, and `node ~/.claude/skills/backlog-validate/scripts/backlog.mjs`
regenerates `artifacts/backlog/README.md` in place. A backlog item was therefore always viable.

The commit message is left unedited rather than rewritten, on the same principle this repository
applies to superseded documents: it is an accurate record of what was believed at the time, and
amending it would erase the evidence that a correction happened.
