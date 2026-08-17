# 0010 — The aggregate status, and why unknown outranks blocked

- **Status:** Accepted
- **Date:** 2026-08-16
- **Accepted:** 2026-08-16, after the adversarial derivability check recorded below
- **Deciders:** project owner
- **Supersedes:** nothing
- **Scope note:** this ADR decides the meaning of one output field. It is not a general reopening
  of PredictionStandards. Items held elsewhere — the CI-teardown ownership candidate, the
  merge-topology convention, the withheld retroactive `v1.0.0` tag — are untouched and remain held.
  None of them earns entry by being adjacent to this one.

## Context

### The trigger

`StandardsEnforcer` has released an adapter contract, `schemas/standards-adapter.schema.json`
(schemaVersion `1.0.0` and `1.1.0`), and pinned three packs against it — Betting `v1.0.1`,
MachineLearning `v1.4.1`, Mathematics `v1.0.1`. The contract requires a pack's verdict at the
**top-level `status` key** of its JSON, and the schema's `$absentByDesign` block records that no
`statusPath` expression exists, naming this pack as the reason it would have needed one:

> "PredictionStandards would have — and its integration is blocked for a different reason: it
> publishes no authoritative status at all."

The enforcer's `artifacts/evidence/2026-08-09-adapter-releases.md` states our remedy as two things,
and warns that doing one alone leaves us where Innovation is:

> `Prediction          authoritative status + release containing the contract`

This is a governance component that has shipped, depending on an interface this pack does not
publish, where the interface cannot be supplied without deciding new semantics. That is the bar for
opening a cycle.

### What we publish today

Verified by execution, not by reading. `node scripts/predictions.mjs check . --json` emits:

```
top-level keys: schemaVersion, command, policy, asOf, parameters, records, aggregate
aggregate:      { supported: 20, supportedWithExceptions: 0, insufficientlySupported: 26,
                  blockedByInvariant: 6, notEvaluated: 0 }
```

Counts, not a verdict. Every `status` in the envelope is per-record. There is no single value the
adapter's `result.statuses` and `result.passing` could bind to.

### The question

> Given a directory check containing multiple prediction records, what single top-level status
> truthfully represents the aggregate without hiding any stronger negative disposition?

## The finding that should decide it

**This pack already ships two precedence orderings over these five values, and both place
`NOT_EVALUATED` above `BLOCKED_BY_INVARIANT`.**

**One — the per-record status**, `scripts/compliance.mjs:481-486`:

```js
let status;
if (!policy) status = STATUS.NOT_EVALUATED;
else if (invariantFailures.length > 0) status = STATUS.BLOCKED_BY_INVARIANT;
else if (failures.length > 0) status = STATUS.INSUFFICIENTLY_SUPPORTED;
else if (excepted.length > 0) status = STATUS.SUPPORTED_WITH_EXCEPTIONS;
else status = STATUS.SUPPORTED;
```

**Two — the command exit contract**, `scripts/predictions.mjs:468-470`:

```js
if (aggregate.notEvaluated > 0) process.exit(EXIT_INVOCATION);   // 2, checked first
const bad = aggregate.insufficientlySupported + aggregate.blockedByInvariant;
process.exit(bad > 0 ? EXIT_FINDINGS : EXIT_OK);                 // 1 or 0
```

`notEvaluated` is tested **before** blocked and insufficient, and routes to exit **2 — invocation**,
not to exit 1. The pack has been saying for two releases that a not-evaluated record is a
configuration fault rather than a bad verdict. `evaluateAll`'s own docstring says it in words:

> "`policy` may be null, in which case every record is NOT_EVALUATED — a missing policy is a
> configuration fault, never a failing prediction."

A precedence model that puts `BLOCKED_BY_INVARIANT` first would make the aggregate the **only**
place in the pack where these two invert. That is the strongest argument available here, and it is
an argument from what we already shipped rather than from taste.

## Decision

```
                              (no records)  → command fault, exit 2, no status published
any record NOT_EVALUATED                    → NOT_EVALUATED
else any BLOCKED_BY_INVARIANT               → BLOCKED_BY_INVARIANT
else any INSUFFICIENTLY_SUPPORTED           → INSUFFICIENTLY_SUPPORTED
else any SUPPORTED_WITH_EXCEPTIONS          → SUPPORTED_WITH_EXCEPTIONS
else                                        → SUPPORTED
```

Two changes from the model proposed at the start of this cycle: `NOT_EVALUATED` and
`BLOCKED_BY_INVARIANT` are transposed, and the empty set is lifted out of the lattice entirely
rather than given a status.

The aggregate status is a claim about **the checked set**, not about every record in it. The
published wording is: *"at least one record in the checked set carries this disposition, and none
carries a more consequential one."*

## The six questions, answered

### 1. Does one `BLOCKED_BY_INVARIANT` legitimately dominate every other record?

**Yes, over the domain verdicts.** `BLOCKED_BY_INVARIANT` already means *stop, do not look for a way
around this* (Standard 18 R5, `compliance.mjs` header property 4). It arises from a failing
non-exemptible rule or a detected attempt to waive one — `disposition: "invariant-violated"`,
`"rejected-exception"`, `"rejected-override"`, or `nonExemptible: true`. There is no count of
supported records that makes a detected waiver attempt safe to proceed past. 99 supported records
and 1 blocked record is a blocked set.

**But it does not dominate `NOT_EVALUATED`**, for the reason in the finding above: those two are not
on the same axis. `BLOCKED_BY_INVARIANT` is a verdict; `NOT_EVALUATED` is the absence of one.

**And the aggregate claim must be scoped.** "This set is blocked" is true and useful; "every
prediction is blocked" would be false whenever the other 99 are fine. The `blockedBy` rule ids stay
per-record, and `aggregate` retains the counts, so a consumer can always ask *which* records without
the top-level field over-claiming.

### 2. Should `NOT_EVALUATED` outrank `INSUFFICIENTLY_SUPPORTED` — and `BLOCKED_BY_INVARIANT`?

**Yes to both, and the rationale is categorical rather than a severity judgement.**

`INSUFFICIENTLY_SUPPORTED` and `BLOCKED_BY_INVARIANT` are both **findings**: the evaluator ran, and
this is what it established. `NOT_EVALUATED` is a statement that **no finding was established** — it
is a claim about the run, not about the prediction.

Ranking a finding above a non-finding would publish an authoritative disposition over records the
evaluator never reached. That is the false green this framework exists to stop, in its subtler form:
not "unknown reported as passing," but "unknown reported as a known failure." Both are fabrications;
the second is merely a fabrication that happens to be unflattering.

Concretely: 5 blocked records and 1 record whose policy could not be loaded. Publishing
`BLOCKED_BY_INVARIANT` asserts a verdict over all six, and the sixth has no verdict. Publishing
`NOT_EVALUATED` says the set could not be authoritatively evaluated — which is what happened — and
the counts still show the 5 blocked.

**A structural fact that must not be leaned on.** Today `NOT_EVALUATED` is all-or-nothing: the
policy is resolved once per run (`resolvePolicyPath`, `predictions.mjs:126`) and handed to every
record, so `!policy` makes *every* record `NOT_EVALUATED`. Rules that individual records prevent
from being reached become `skipped` and land in `assurance.notEvaluated` — they do **not** produce a
record status of `NOT_EVALUATED`. So the mixed case is currently unreachable through that path. The
rule above must not depend on that; per-record `--policy` resolution or a future record-level
not-evaluated disposition would make it reachable immediately, and the ordering has to already be
right when it is. It is stated as `any`, and the invariant tests below construct the mixed case
synthetically rather than waiting for it to occur.

### 3. Is `SUPPORTED_WITH_EXCEPTIONS` meaningful when only one record carries an exception?

**Yes, and the phrase does not over-claim — but only because of how the record-level status is
already worded.**

At record level, `SUPPORTED_WITH_EXCEPTIONS` means *this record is supported, and at least one
exception was consumed to get there* — not *every rule was excepted*. It is already a
some-quantifier over rules. Lifting it to a some-quantifier over records preserves the reading
exactly: *this set is supported, and at least one exception was consumed somewhere in it.*

The failure mode to reject is the opposite one: a set where 1 record has an exception and 99 are
clean reporting plain `SUPPORTED`. That would hide a consumed exception behind a majority, which is
precisely the percentage-thinking this ADR avoids. An exception is a knowing departure with an
approver and an expiry; it should survive aggregation, not be averaged away.

Note the asymmetry this creates, and accept it deliberately: `SUPPORTED_WITH_EXCEPTIONS` is
**passing** in the adapter's `result.passing`, so this ordering does not gate a merge — it labels
one truthfully. The consequence is only that the label is visible.

### 4. What happens for an empty record set?

**It is already a command fault, and this ADR keeps it one.** `predictions.mjs:155`:

```js
if (loaded.length === 0) throw new Error(`no records found at ${target}`);
```

The throw is caught at the call site and exits `EXIT_INVOCATION` (2) before any JSON is written. So
vacuous `SUPPORTED` is not merely rejected here — it is already unreachable, and no change is
needed to keep it that way.

**The decision this ADR must make explicitly is that the fault path stays a fault path.** It would
be easy, while adding a top-level status, to start emitting `{ "status": "NOT_EVALUATED", "records":
[] }` for an empty directory on the grounds that it is more machine-readable. **Reject that.** A
directory containing no records is not a subject that was hard to evaluate; it is a target that was
probably wrong. Publishing any status for it converts an operator error into a domain result, and
`NOT_EVALUATED` is exactly the value a consumer would be most likely to treat as a real, if
uninformative, verdict.

### 5. What about malformed records, and the exit-2 path?

This is the sharpest existing inconsistency, and it must be settled before implementation.

An unparseable record today takes a **third** shape, distinct from both a verdict and a fault:

- `predictions.mjs:166` — it enters `reports` as `{ file, parseError, envelope: null }`.
- `:214-216` — the aggregate counts it: `if (!report.envelope) aggregate.notEvaluated++`.
- `:397` — its JSON record object spreads `...(r.envelope ?? {})`, so it carries `parseError` and
  **no `status` field at all**.
- `:253` — the text renderer nonetheless prints
  `NOT_EVALUATED — the record could not be parsed: <message>`.

So the counts say `notEvaluated`, the human output says `NOT_EVALUATED`, and the machine-readable
record says nothing. Three answers to one question.

**Decision: an unparseable record is `NOT_EVALUATED`, and it contributes to the aggregate as one.**
It is the same category as a missing policy — the evaluator could not reach a verdict for a reason
that is not about the prediction's evidential support. This ratifies what the counts and the text
already do, and closes the gap by making the per-record JSON carry `"status": "NOT_EVALUATED"`
alongside its `parseError`, so the three agree.

The consequence follows from question 2's ordering, and is intended: **a run containing one
unparseable file and any number of blocked records aggregates to `NOT_EVALUATED`, exits 2, and is
not passing.** A consumer cannot mistake a partially-unreadable corpus for an evaluated one.

**The boundary is drawn at whether a per-record result exists.** A malformed *record* is a record
that produced a not-evaluated result — it is inside the lattice. A malformed *invocation* — no
records found, unknown flag, unparseable `--as-of`, an invalid policy document — produces no records
at all, exits 2 before any JSON is written, and **publishes no status**. The top-level status must
never be manufactured out of a configuration failure.

### 6. Does the aggregate derive solely from per-record statuses?

**Solely, and the boundary is crisp:**

> The top-level `status` is a total function of the multiset of per-record statuses, and of nothing
> else. Command-level and configuration failures do not override it — they **prevent it from
> existing**, by terminating before the envelope is written.

There is no path where a configuration fault produces a JSON document carrying a status. There is no
path where the score, the record count, `frameworkCoverage`, or the exit code feeds back into the
status. Two properties fall out that are worth stating as such:

- **No status without records.** If `records` is present and non-empty, `status` is present. If the
  command failed, neither is.
- **The status is recomputable by a consumer** from `records[].status` alone, with no access to our
  internals. An enforcer that wanted to check our arithmetic can.

## Invariants

Each is a test, not a description. Each is stated with the mutation that must make it fail.

**I1 — Deterministic and order-independent.** For any multiset of record statuses, the aggregate is
the same under every permutation of the input, across runs, and independent of filesystem
enumeration order. *Mutation:* derive the status from `records[0]`, or from the last record seen;
the shuffled-input test must go red.

**I2 — Monotone: adding a worse record cannot improve the aggregate.** For the total order
`SUPPORTED < SUPPORTED_WITH_EXCEPTIONS < INSUFFICIENTLY_SUPPORTED < BLOCKED_BY_INVARIANT <
NOT_EVALUATED`, appending a record can only move the aggregate up that order or leave it unchanged.
Asserted exhaustively over all 25 (aggregate, added-record) pairs, not by sampling. *Mutation:* any
percentage or ratio term — `blocked / total`, a majority vote, a score threshold — breaks I2 the
moment a supported record is appended, and the exhaustive table catches it on the first pair.

**I3 — Removal reveals the next-most-consequential status.** Removing every record carrying the
dominant status yields the next status actually present in the remainder — never a recomputation
through score or percentage. *Mutation:* re-derive from the mean score; a set of
`[BLOCKED, SUPPORTED, SUPPORTED]` minus the blocked record must become `SUPPORTED`, not a
score-derived value that could land anywhere.

**I4 — No status without records** (from question 6). An empty or absent record set publishes no
`status` key and exits 2. *Mutation:* emit `status: "NOT_EVALUATED"` for an empty directory; the
test asserting the key's **absence** must go red.

I1–I3 are the three required by the cycle brief. I4 is added because questions 4 and 5 both turn on
it and it is otherwise only enforced by a `throw` that a later refactor could soften into a
default.

## Falsifiers and counterexamples

Kept because each one nearly changed the decision.

**F1 — "Blocked is the most consequential thing a checker can say, so it must dominate."** The
strongest case against the chosen ordering, and the reason the transposition needs defending rather
than asserting. It fails because it compares consequence across categories: `NOT_EVALUATED` is not a
milder verdict than blocked, it is the statement that no verdict was reached. Answering "is this set
blocked?" with "we could not evaluate part of it" is not a weaker warning — it is the only true one.
And on the practical axis the concern evaporates: both are non-passing, both exit non-zero, and the
`blockedBy` ids and `aggregate.blockedByInvariant` count remain visible in the envelope regardless
of which label wins. Nothing is hidden; only the headline changes.

**F2 — "`NOT_EVALUATED` first means one unreadable scratch file masks five real blocks."** True, and
accepted. The counts still show `blockedByInvariant: 5`, and the check is non-passing either way, so
nothing is concealed. The alternative is worse: it publishes a verdict over a corpus we admit we
could not fully read. If the unreadable file is genuinely not a record, the fix is to stop feeding
it to the checker — the tool should not paper over a corpus it was pointed at wrongly.

**F3 — "Empty set → `NOT_EVALUATED` is more machine-readable than exit 2."** Rejected in question 4.
It converts an operator error into a domain result, and hands the consumer the one value most likely
to be read as a real verdict.

**F4 — "Aggregate over rules rather than over records."** Union every record's rule results and run
`summarise` once. Rejected: it destroys the record as the unit of judgement (ADR 0001), and a rule
non-exemptible *for one record* would silently become non-exemptible for the set. It also breaks I3,
since removing a record does not cleanly remove its rules from a union.

**F5 — "Weight by score."** Rejected on the pack's own first load-bearing property
(`compliance.mjs` header): *"Status is computed from rules, never from the score. There is no
threshold at which a percentage grants or withdraws support."* Any weighting reintroduces exactly
the threshold that property forbids, and breaks I2.

**F6 — "`SUPPORTED_WITH_EXCEPTIONS` for a single exception among 99 clean records overstates."**
Answered in question 3: it is already a some-quantifier at record level, and the alternative hides a
consumed exception behind a majority.

## The four channels stay separate

Restated because adding a fifth field is exactly when they blur:

| Channel | Question it answers | Must never substitute for |
|---|---|---|
| `aggregate` counts | how many records landed where? | the verdict |
| top-level `status` | what is the authoritative disposition of this set? | the counts, or the exit code |
| `frameworkCoverage` | how much of the framework was in play at all? | either of the above |
| exit code | did the command run, and did it find something? | the status |

Two collisions to name so they are not walked into:

- The `status` **command** reaches no verdict (ADR 0007: *"aggregate posture of a directory"*,
  verdict: no) while the top-level `status` **key** is a verdict. The key is emitted by `check`. If
  `status` and `explain` also emit it — they run the same evaluation — that must be a deliberate
  decision, not a side effect of sharing the envelope, because it would put a verdict in the output
  of two commands documented as not producing one. **Left open below.**
- The exit code is already a lossy projection of the status and stays that way: 2 for
  `NOT_EVALUATED`, 1 for `INSUFFICIENTLY_SUPPORTED` and `BLOCKED_BY_INVARIANT` alike, 0 for the two
  supported values. The enforcer does not read exit codes as verdicts
  (`standards-adapter.schema.json`, `$absentByDesign.exitCodes`), so no realignment is needed — but
  the existing mapping must not be quietly changed while implementing this.

## Downstream: the adapter contract

Mechanical once the above is settled, and deliberately not decided here beyond its shape. Against
schemaVersion `1.0.0` — `{policy}` is a 1.1.0 placeholder and this pack does not need it, since its
policy resolution walks up from the target:

```json
{
  "$schema": "https://standards-enforcer/schemas/standards-adapter.schema.json",
  "schemaVersion": "1.0.0",
  "standard": { "id": "prediction" },
  "evaluation": {
    "entrypoint": "scripts/predictions.mjs",
    "arguments": ["check", "{target}", "--json"]
  },
  "result": {
    "statuses": [
      "SUPPORTED",
      "SUPPORTED_WITH_EXCEPTIONS",
      "INSUFFICIENTLY_SUPPORTED",
      "BLOCKED_BY_INVARIANT",
      "NOT_EVALUATED"
    ],
    "passing": ["SUPPORTED", "SUPPORTED_WITH_EXCEPTIONS"]
  }
}
```

Note `entrypoint` and the literal verdict subcommand are both forced by us: the enforcer's schema
documents `scripts/predictions.mjs` as the reason the field exists, and our `check` is the verdict
command where four other packs use `validate`. `passing` is the pack's declaration, not the
enforcer's inference (ADR 0001 forbids the enforcer knowing what a status means) — which is the
point of principle here: **PredictionStandards owns the meaning of this vocabulary; StandardsEnforcer
only consumes what we declare.**

## The assurance boundary — what a consumer may not derive

The aggregation rule above is sound only if consumers read the field as narrowly as it is defined.
This section is the adversarial pass: for each stronger claim a consumer might derive, whether it is
entailed, and what actually licenses it.

**The one sentence that governs the field:**

> The top-level `status` is the strongest disposition observed over the checked set. It is **not a
> summary of findings**, and no subordinate outcome may be inferred from it — in either direction.
> Every observed outcome is in `aggregate`; every reason is in `records[]`. A consumer needing to
> know what was found must read those.

| Tempting inference | Entailed? | Why not, and what to read instead |
|---|---|---|
| `NOT_EVALUATED` → no invariant violations were observed | **No** | The F2 case exactly: 5 blocked + 1 unreadable → `NOT_EVALUATED`. Read `aggregate.blockedByInvariant`. **The dangerous reading, and the reason this section exists.** |
| `NOT_EVALUATED` → nothing was evaluated | **No** | Any number of records may carry complete verdicts. It means *not every* record did. Read the counts. |
| `SUPPORTED` → every applicable rule passed | **No** | Rules nothing evaluated are `skipped` and excluded from the score's denominator. Read `assurance.notEvaluated` per record. This is the pack's oldest stated property and it survives aggregation unchanged. |
| `SUPPORTED` → every record was fully evaluated | **No** | Same mechanism. Breadth is `frameworkCoverage`, never the status. |
| `BLOCKED_BY_INVARIANT` → every record is blocked | **No** | Some-quantifier. Read `aggregate.blockedByInvariant` and the per-record `blockedBy` ids. |
| `SUPPORTED_WITH_EXCEPTIONS` → every record carried an exception | **No** | Some-quantifier at both levels (question 3). |
| absence of `status` → `SUPPORTED` | **No** | Absence means no records and a command fault (I4). A consumer treating a missing key as benign inverts the invariant. |
| a passing status → merging is safe | **Bounded** | It licenses exactly what `result.passing` declares, over the records checked. It says nothing about records not in the target. |
| the status is a property of the commit | **No** | See below. |

### The status is a function of `(tree, asOf)`, not of the tree alone

Found while checking derivability, and the one item here that is not merely a wording risk.

Exception expiry (`compliance.mjs:106`) and attestation expiry (`:389`) both compare against
`today`, derived from `asOf`, which defaults to `new Date().toISOString()`
(`predictions.mjs:345`). So an unchanged corpus at an unchanged commit can move
`SUPPORTED_WITH_EXCEPTIONS → INSUFFICIENTLY_SUPPORTED`, or `SUPPORTED → INSUFFICIENTLY_SUPPORTED`,
with no edit to any file. That is deliberate — an exception past its expiry is a compliance failure,
not a resolution — and aggregation inherits it unchanged.

The hazard is that a consumer records the verdict against a release identity and treats it as
settled. StandardsEnforcer's identity model is `(repository, tag, commit SHA)`, which makes
"prediction: SUPPORTED at `<sha>`" the natural thing to write down, and it would be wrong the day an
exception lapses.

**Checked, and it is not a live defect there:** the enforcer's cache is content-addressed by
*release identity* and stores the standards-pack checkout, not verdicts (ADR 0006: *"No process may
execute bytes it has not re-verified against the requested identity"*). It re-executes the evaluator
each run. So the exposure is to any future consumer that memoises a verdict, not to the enforcer
today.

**Requirement on the published contract:** a verdict is valid as of the `asOf` in the same envelope,
and any consumer storing one must store `asOf` beside it. The envelope already carries the field; it
must be documented as load-bearing rather than decorative.

### Where this must appear

Not only here, or it protects nothing:

1. `STATUS_NOTE` gains an aggregate-level entry stating the some-quantifier reading and the
   not-a-summary sentence.
2. The `check --json` documentation states the boundary next to the field, since a consumer
   integrating against the adapter may never read this ADR.
3. Adapter-facing: the enforcer's contract has no field for this — `result` carries `statuses` and
   `passing` only, and `$absentByDesign` shows fields are added by need, not by anticipation. So the
   boundary cannot travel inside `standards-adapter.json`, and must live in our published docs with
   the enforcer's integration record pointing at it. **This is a limitation of the transport, and it
   is the reason the wording obligation is listed as acceptance criteria rather than as advice.**

## Consequences

- The pack gains an authoritative single verdict and can satisfy half of its recorded dependency.
  The other half — a tagged release containing the contract — is not addressed here.
- `NOT_EVALUATED` becomes a more visible outcome, because one unreadable file now labels the whole
  set. Intended.
- Three existing disagreements about unparseable records collapse into one answer.
- Nothing about per-record evaluation changes. `summarise` is untouched.

## The four open decisions, dispositioned

Raised by the proposal draft; owner-dispositioned at acceptance.

**1. Version number — deferred to release review.** `main` is nine commits past `v1.1.0`
(`ebe232b`) and already carries unreleased CI work. Whether the next release packages that together
with this interface work or separates them is a release-review question. **No retroactive change to
`v1.1.0`.** This ADR does not need the number and does not choose it.

**2. Do `status` and `explain` also emit the top-level key? — No. `check` only.** `check` is the
command that produces the policy-aware authoritative disposition and is the adapter entrypoint.
`audit` deliberately reaches no verdict; `explain` explains rule application; `status` has its own
reporting semantics and ADR 0007 records it as reaching no verdict. Reusing the field name in a
command documented as verdict-free would blur an established boundary to save nothing — the two
commands share the envelope builder, so this is an explicit omission, not an oversight, and needs a
test asserting the key's **absence** from `status --json` and `explain --json`.

**3. Envelope `schemaVersion` — decide from compatibility policy, with this evidence in hand.**
Investigated at acceptance rather than deferred blind, and the finding changes the shape of the
question:

- **There is no schema for the report envelope.** `schemas/` contains
  `prediction-record.schema.json` and `project-policy.schema.json` and nothing else. The envelope's
  `"schemaVersion": "1.0"` is a bare literal in `envelope()` (`compliance.mjs`), validated by
  nothing. So no strict validator can exist against it today, and the "breaking for strict
  validators" concern has no current instance — but it also means the version currently promises
  whatever the next reader assumes, which is the weaker position, not the safer one.
- **The version strings are not even the same shape.** The record schema uses semver (`"1.0.0"`);
  the envelope uses `"1.0"`. Whatever is decided should not quietly leave that unexplained.
- **ADR 0008 set the precedent on the pack's other schema:** an *optional, additive* field
  (`subject.falsifiability`) still took a minor bump, 1.0.0 → 1.1.0. The new `status` key is
  additive but **always present** when records exist — strictly more visible than the change that
  already warranted a bump there.

On that precedent the answer is very likely a bump, and leaving it at `"1.0"` merely because
tolerant JSON consumers ignore unknown keys would be the reasoning ADR 0008 declined. Not settled
here, because the honest version of this decision is *what does the envelope's `schemaVersion`
promise* — which is a small policy question the pack has never answered, and answering it inside an
aggregation ADR would be the scope creep this cycle was opened narrowly to avoid.

**4. Stale-digest falsy read — stays out.** At `compliance.mjs:395-396`, an uncomputable digest is
falsy and therefore reads as *matching*; StandardsEnforcer's M3 plan records it as our defect on our
release cycle. It is real and it is adjacent. **Adjacency is not evidence.** This cycle was opened
because a released governance component depends on an interface we do not publish; fixing unrelated
compliance semantics under that mandate would dissolve the discipline that justified opening it.

## Acceptance criteria

What must be true before this ADR is satisfied, in the order the work should go red-first:

1. The aggregation rule, with I1–I4 as tests written before the derivation exists. I2 exhaustive
   over all 25 (aggregate, added-record) pairs; I1's mixed `NOT_EVALUATED` case constructed
   synthetically, since the single-policy resolution makes it otherwise unreachable.
2. Parse-error normalization: an unreadable record's JSON object carries
   `"status": "NOT_EVALUATED"` beside its `parseError`, so the counts, the text renderer and the
   machine-readable record stop giving three answers.
3. The absence tests: no `status` key for an empty target (I4); no `status` key from `status --json`
   or `explain --json` (decision 2).
4. The assurance boundary published in `STATUS_NOTE` and in the `check --json` documentation, with
   the not-a-summary sentence and the `asOf` validity requirement.

Then, and only then, `standards-adapter.json`. Then, separately, the release review.

## Held items, untouched

Restating the scope note because an accepted ADR is exactly when adjacent work starts looking
authorized. None of the following is promoted, started, or made more likely by this decision: the
CI-teardown ownership candidate, the non-squash merge-topology convention, the withheld retroactive
`v1.0.0` tag, or the stale-digest defect above. Each remains held until it independently earns entry
on its own evidence.
