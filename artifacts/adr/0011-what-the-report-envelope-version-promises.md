# 0011 — What the report envelope's `schemaVersion` promises, and why `status` earns a minor bump

- **Status:** Accepted
- **Date:** 2026-08-23
- **Deciders:** project owner
- **Disposes of:** [report-envelope-versioning](../release-review/report-envelope-versioning.md),
  raised during the ADR 0010 aggregation cycle and marked *disposition required before the next
  release*
- **Scope note.** This decides one thing: what the **report envelope's** version means. It does not
  choose this pack's next release number, does not touch the standards, the rule catalog, the record
  schema or the project-policy schema, and does not reopen [ADR 0010](./0010-the-aggregate-status.md).
  The held items named in ADR 0010 — the CI-teardown ownership candidate, the merge-topology
  convention, the retroactive `v1.0.0` tag, the stale-digest falsy read at `compliance.mjs:395` —
  remain held. Adjacency is still not evidence.

## The question

> **What promise does the JSON report envelope's `schemaVersion` make, and does adding an
> authoritative top-level `status` require it to change?**

ADR 0010 shipped the `status` key and left `schemaVersion` at `"1.0"` as an explicit holding
position. This answers the question it was holding.

## What the version means today: measured, not assumed

Every emission site and every consumer was read before anything was decided.

**Three different documents carry `"1.0"` right now.**

| Emitter | Shape | Top-level `status` |
|---|---|---|
| `predictions.mjs` — the report | `schemaVersion, command, policy, asOf, parameters, [status], records[], aggregate` | the five verdict statuses, `check` only |
| `compliance.mjs` `envelope()` — one record, **nested inside `records[]` of the above** | `schemaVersion, standardVersion, project, record, status, score, summary, assurance, blockedBy, denominator, parameters, frameworkCoverage, evaluatedAt, asOf, results` | the five verdict statuses, always |
| `policy.mjs --json` — a policy check | `schemaVersion, policy, status, errors, findings` | **`ok` / `findings` / `invalid`** |

The third is the sharpest. A document with a disjoint `status` vocabulary carries the same version
string as the document whose `status` StandardsEnforcer treats as a verdict. Nothing prevents a
consumer wiring the wrong one to a gate; only the adapter naming `check` literally stops it, which is
an argument for that design rather than a defence of this one.

**Four more machine-readable outputs in this pack carry no version at all** — `ci.mjs --json`,
`inventory.mjs --json`, `fidelity.mjs --json`, `integrity.mjs --json`.

**No schema exists.** `schemas/` holds `prediction-record.schema.json` and
`project-policy.schema.json`. Nothing describes the report.

**Nothing reads it.** Not this pack — the string is written and never compared. Not StandardsEnforcer
— `scripts/enforce.mjs` reads the pack's top-level `status` and never its `schemaVersion`.

**This pack's only version comparator rejects it.** `atLeastRecordSchema` (`records.mjs:115`) returns
false for any string that does not split into exactly three integer parts. `"1.0"` is below every
floor it could ever be compared against. The one piece of version machinery the pack owns cannot read
the envelope's version.

**The report's shape has, however, been stable.** Traced through `999c34d` (v1.0.0), `4569bca`,
`8df85fa`, `ebe232b`: the top-level key list is unchanged, and `envelope()` is unchanged since
v1.0.0. So this is not a case of a version that has already lied about shape. It is a version that
has never been asked to describe one.

**One change did land in this cycle beyond the top level.** At v1.0.0 an unreadable record produced
`{file, parseError}` — with **no `status` key at all**. Since ADR 0010 it produces
`{file, parseError, status: "NOT_EVALUATED"}`. So `records[].status` went from *sometimes absent* to
*always present*, alongside the new top-level key. Both are additive; both are consumer-visible; the
disposition has to cover both, and a policy that only considers the top-level key is answering a
smaller question than the one that was asked.

### The honest summary of the present state

The version promises **nothing that anyone can rely on**. It is a literal that looks like a contract,
is validated by nothing, is read by nobody, labels three incompatible shapes, and cannot be parsed by
the pack's own comparator. This is not a safe default. A version that promises nothing promises
whatever the next reader assumes.

## Decision

### D1 — The version describes **backward-compatible shape**, stated as a reader contract

> A consumer written against report `schemaVersion` `M.m.p` may assume that any report whose version
> is `M.m'.p'` with the **same major** and `m' ≥ m` contains **every key documented at `M.m`**, with
> the documented type and the documented meaning.
>
> A consumer may **not** assume that no other keys are present, and may not assume a report of a
> different **major** is readable at all.

Two consequences worth stating rather than leaving to be inferred.

**The promise is about documented keys, so a definition of "documented" is load-bearing.** Without
one, D1 is prose, and prose asserting a constraint nothing executes is the condition this ADR exists
to end. That forces D4.

**Absence is never promised.** A key that was sometimes missing and is now always present is
compatible under D1 by construction. This is not a convenience: it is the rule that makes
`records[].status` becoming total an additive change rather than a breaking one, and it is stated
here so that the reasoning is visible rather than assumed after the fact.

### D2 — Adding always-present `status` is compatible, and still requires a bump

Compatible: no documented key was removed, renamed, retyped, or given a new meaning. Additive under
D1, both at the top level and inside `records[]`.

Still a bump: compatible is not *identical*. Two reports that differ in a semantically meaningful way
must be distinguishable by their version, or the version answers no question a consumer would ask it.
A consumer that had written `if (!("status" in record)) skip()` behaves differently against the two
documents, and under a no-bump policy nothing in either document would explain why.

**Minor**, not major, and this is where [ADR 0008](./0008-record-schema-evolution-and-the-legacy-disposition.md)
genuinely applies: it took a minor for an *optional* additive field. An always-present additive key is
more visible than that and still additive, so it lands in the same class.

### D3 — `"1.0"` becomes `"1.1.0"`

Two changes taken together, deliberately.

**The minor bump** is D2.

**The move to three-part semver** is the fix for a version string the pack's own comparator cannot
read. Any bump breaks a consumer doing `version === "1.0"`, so the grammar correction is free at this
moment and is not free at any later one — taking it now costs one incompatibility instead of two, and
the alternative (`"1.1"`) preserves an unparseable form forever in exchange for a consistency nobody
has. That the record schema uses semver and the envelope did not was recorded in the finding as
question 4 and is answered here: it was an inconsistency, not a distinction.

**The rejected alternative, which is close.** *Call it `1.0.0`: you cannot break a contract that never
existed, so define the format now and let this be its first real version.* Rejected on two grounds.
Reports stamped `"1.0"` have been produced and retained, so reusing `1.0.x` for a materially different
shape would make the version actively misleading for the first time — worse than meaningless. And a
`1.0` → `1.1.0` step orders correctly under every comparison and leaves `1.0.x` meaning exactly what
it did mean: *the era before the format was defined.*

### D4 — A report schema is required **now**, not deferred

`schemas/report.schema.json`, describing the top-level document and the `records[]` items, with
`additionalProperties: false` — because the schema **is** the definition of "documented" that D1
rests on, and a schema admitting undocumented keys cannot serve as one.

Validated in CI against the real output of all four commands, not against a fixture written by hand.
The pack's position on this is already on the record in `jsonschema.mjs`: *a hand-written validator
alongside a schema is two definitions, and the drift between them is silent.* A schema nobody runs is
a description of an intention.

**Deferring it was considered and rejected.** Shipping `"1.1.0"` with no schema would reproduce the
original defect one increment higher, and would leave this ADR asserting a promise with nothing behind
it — which is precisely the finding it disposes of.

**The command-conditional key follows ADR 0008 part 2.** `status` is *optional* in the schema; the
rule that it is present exactly when `command` is `"check"` lives in a test, not in a `oneOf`
discriminated on `command`. ADR 0008 rejected schema-level version discrimination because it
duplicates the shape per branch and the copies drift; the same argument applies per command, and the
four commands were measured to be key-identical apart from that one field.

### D5 — One envelope, one version, across all four commands

Measured: `check`, `audit`, `explain` and `status` emit identical top-level key sets and identical
`records[]` key sets, differing only in `status`. They share one builder.

So they share one version and one schema. `command` is itself a documented key, and it is what tells a
consumer which variant it is holding. Four independently numbered contracts would let three of them
drift for no reason anyone could state.

**`policy.mjs --json` is not in this contract.** It is a different document with a different `status`
vocabulary, and it must stop claiming the report envelope's version — see C4.

### D6 — What a consumer may safely assume

**May assume**, given `schemaVersion` `M.m.p`:

- every key documented at the same major and any minor `≤ m` is present, with its documented type and
  meaning (D1);
- `status`, where present, is one of the five values declared in `standards-adapter.json`, and that
  set is **closed** (D7);
- `status` is recomputable from `records[].status` by the fold in ADR 0010, so the arithmetic is
  checkable;
- the report describes the target named by the invocation, evaluated as of `asOf`.

**May not assume:**

- that no undocumented key is present;
- that a different **major** is partially readable — it is not, and a consumer must fail closed rather
  than best-effort a document it does not understand;
- that `command`'s value set is closed (D7);
- that a verdict holds beyond `asOf` — the corpus and the clock are both inputs
  ([docs/json-output.md](../../docs/json-output.md));
- anything about exit codes, which are a lossy projection and carry no version;
- anything about the **standards** version, the **record schema** version, or the **adapter**
  `schemaVersion`. Four independent streams; a change to one says nothing about the others. That
  independence is why `envelope()`'s docstring already claims it, and D4 is what finally makes the
  claim enforceable.

### D7 — How future changes move the version

| Change | Bump | Why |
|---|---|---|
| Add a key, optional or always-present | **minor** | additive under D1; ADR 0008's precedent |
| A sometimes-absent key becomes always present | **minor** | absence is never promised (D1) |
| Remove or rename a documented key | **major** | the promise in D1 stops holding |
| Change a documented key's type | **major** | same |
| Change a documented key's **meaning**, shape unchanged | **major** | the dangerous one: no diff-detectable signal, so the version is the only channel that can carry it |
| Add a member to a **closed** documented value set | **major** | see below |
| Add a member to an **open** documented value set | **minor** | a consumer was never entitled to enumerate it |
| Narrow the set of values actually emitted | **minor** | a reader's exhaustive handling stays valid |
| Add a command that emits this envelope | **minor** | `command` is open |
| Reorder keys | **none** | JSON objects are unordered |

**Closed sets are named, and today there is exactly one: `status`.** Adding a sixth verdict status is
**major**, and the reason is concrete rather than theoretical. StandardsEnforcer fails closed on a
status outside the `statuses` array its adapter declares — deliberately, so that an unrecognised value
is not quietly read as merely not-passing. A new status would therefore make this pack unusable to
every enforcer holding the current adapter until a new adapter is released. A change that breaks a
released consumer is a major change whatever the JSON looks like.

**`command` is open**, so adding a subcommand that emits the envelope is minor.

### D8 — The adapter does not depend on the envelope version

`standards-adapter.json` declares an entrypoint, an argv, and a status vocabulary. It never mentions
`schemaVersion`, and `scripts/enforce.mjs` was read to confirm the enforcer never reads a pack
report's `schemaVersion` — it reads the top-level `status` and nothing else about the format.

So the bump in D3 is **invisible to the adapter and requires no adapter re-release.**

The two artifacts are coupled, but by the **vocabulary, not the version**: the closed `status` set is
published in the adapter and is exactly the set D7 protects with a major bump. That is the whole of
the relationship, and stating it precisely is what stops a future editor bumping one because the other
moved.

## Counterexamples to the four tempting policies

**1. "Never bump for additive JSON keys."**
This cycle is its own counterexample, and not at the key everyone is looking at. `records[].status`
went from absent-on-parse-error to always present. Under this policy there is no bump, so two reports
that make a consumer's `if (!("status" in r)) skip()` branch behave differently are indistinguishable
by version — the report's own history becomes unreadable. The policy also removes the only signal by
which a consumer could *choose* to upgrade, which is what a version is for. Tolerant parsers ignoring
unknown keys is a fact about parsers, not a promise the producer made.

**2. "Any shape change requires a major bump."**
ADR 0008 is the counterexample in the other direction: an optional additive field took a minor, and
nothing broke because nothing could. Under a major-for-everything rule, adding `status` makes the
report `2.0.0` and tells every consumer to stop reading a document in which nothing they previously
read has changed. A false alarm carries the same cost as a false green — it trains consumers to ignore
the version — and here it would fire on the very first change, for a key nobody was reading yet.

**3. "Copy the prediction-record versioning policy."**
The direction of travel is opposite, and the policy is shaped by that direction. The record version is
a **producer-declared input that this pack reads to gate rules**: `atLeastRecordSchema(record
.schemaVersion, "1.1.0")` decides whether `falsifiability.declared` is evaluated or reported
`not-evaluated`. It has an operational consequence inside the evaluator, and ADR 0008 part 4 had to
declare pinning it a Standard 18 manipulation *precisely because a producer chooses it*. The envelope
version is this pack's **output, read by nobody**: it gates nothing and cannot be gamed. Transplanting
the record policy imports per-record upgrade paths, version-gated rules and an anti-pinning norm for a
field subject to none of those forces. What does transplant is the narrower lesson, and it is the one
D2 uses: a bump is earned by a change a consumer could notice, not by whether the field is optional.

**4. "The version is informational only."**
Live, in the consumer, today. `StandardsEnforcer/scripts/enforce.mjs:53` stamps
`schemaVersion: SCHEMA_VERSION = "0.5.0"` into its own result payload. That literal was set once at
M1 (`14f6f28`) and never changed. Since then the product reached `0.6.0`, the payload gained
`authoritative`, `scope` and `policy` blocks, and `isStandardsVerdict` changed from
`VERDICT_STATES.has(state)` to `state === STATE.EVALUATED` — a meaning change under an unchanged
name. The field now reads as a contract, is maintained by nobody, and is wrong about the document
carrying it. (The observations are measured; the reading of them is this ADR's.) This pack has the
same condition in miniature: one string on three shapes. "Informational" is not a lighter promise. It
is an unmaintained one, and the difference only shows up once somebody relies on it.

## The stdout-drain defect: in scope for the adapter cycle, irrelevant here

The adapter work found that `check --json` wrote its report and then called `process.exit`, which does
not wait for a pipe to drain — delivering about 214 KB of a 250 KB document on Linux, a well-formed
prefix ending mid-string. It is recorded as implementation evidence for that cycle: it was invisible
on a Windows host and reproduced every time in the container, and it is why the adapter's promise
needed a run rather than an argument.

**It has no bearing on this decision, and the reason is worth stating once.** The defect concerned
whether the document *arrives*, not what the document *says*. No key changed, no meaning changed, no
consumer that received a whole report before would receive a different one after. A version bump
signals a change in the contract; a truncated stream is a violation of it. Letting a delivery fix
touch the format version would establish that the number moves for reasons the number does not
describe — which is how a version becomes informational (counterexample 4) one commit at a time.

## Downstream implementation consequences

Exact, and none of them performed by this ADR.

**C1 — `schemas/report.schema.json`, new.** Top-level document plus `records[]` items,
`additionalProperties: false`, `$id` naming this pack. `status` optional at the top level;
`schemaVersion` a `const` of `"1.1.0"`. Every key currently emitted is enumerated: eight at the top
level, seventeen per record entry.

**C2 — one constant, one place.** `"1.0"` is currently a literal repeated in `compliance.mjs`
(`envelope()`) and `predictions.mjs` (the report builder). A version written twice is two versions.
Both become one exported `REPORT_SCHEMA_VERSION = "1.1.0"`.

**C3 — tests.** Each of the four commands' `--json` output validates against C1, over a real run.
The emitted version equals the constant, and the constant equals the schema's `const` — a
three-way agreement, because any two of them agreeing is a coincidence. Plus the ADR-0008-shaped rule
test: `status` is present exactly when `command` is `"check"`.

**C4 — `policy.mjs --json` stops carrying `schemaVersion: "1.0"`.** It is a different document with a
different `status` vocabulary and no contract. The field is **removed** rather than renumbered:
defining a second format is a separate question this ADR does not answer, and a version naming no
contract is worse than no version. Its removal is a shape change to a document under no promise, and
belongs in the changelog as such.

**C5 — [docs/json-output.md](../../docs/json-output.md).** The sample's `"schemaVersion": "1.0"`
becomes `"1.1.0"`, and the page gains a section stating D1, D6 and D7 — the consumer-facing half of
this ADR, for the reader who will never open an ADR.

**C6 — `CHANGELOG.md`.** Report schema version `1.0` → `1.1.0` under the stream the changelog already
declares, naming both the additive `status` (top level and per record) and the one-time grammar change
from a two-part to a three-part version. The `[Unreleased]` paragraph that currently says
`schemaVersion` remains `1.0` pending this disposition is replaced.

**C7 — `README.md:125`.** The layout block describes `schemas/` as "prediction-record and
project-policy schemas". It gains the report schema.

**C8 — [report-envelope-versioning.md](../release-review/report-envelope-versioning.md).** Status
Open → Dispositioned, pointing here. Its four questions map to D1/D6, D4, D2/D3 and D3 respectively.

**C9 — no adapter change.** `standards-adapter.json` is untouched and needs no re-release (D8).

**C10 — not decided here.** This pack's next release number and whether these changes ship in it; the
tag; the merge. A report schema version is not a product version, and conflating them is
counterexample 4 wearing a different hat.

## Acceptance criteria

1. C1 exists and C3 passes, red-first: the schema is written and the validation test fails before
   `additionalProperties: false` is satisfiable, so the schema is shown capable of rejecting.
2. A falsifier per rule in D7 that is mechanically checkable: adding an undocumented key fails C3;
   the version constant disagreeing with the schema fails C3; `status` appearing on `audit --json`
   fails C3.
3. No emission site retains a literal version string (C2).
4. `policy.mjs --json` carries no `schemaVersion` (C4).
5. Local CI green in both environments — host and container — before this is called done. The last
   cycle reported green on the host alone and the container is what found the drain defect.

## Held items, untouched

The CI-teardown ownership candidate, the non-squash merge-topology convention, the withheld
retroactive `v1.0.0` tag, and the stale-digest falsy read at `compliance.mjs:395`. None of them
becomes admissible because a versioning decision passed nearby.
