# 0012 — How a policy's declared framework version is resolved, and what an unresolvable one does

- **Status:** Accepted
- **Date:** 2026-09-04
- **Deciders:** project owner
- **Disposes of:** the *"deliberately not decided"* section of
  [2026-08-25 policy standard-version semantics](../release-review/2026-08-25-policy-standard-version-semantics.md),
  which identified the unverified field as a cycle of its own and named itself as the evidence that
  cycle would start from. Tracked as ST-26 under FE-14 / EP-07 / IN-05.
- **Revised before merge, 2026-09-06.** A first draft resolved a version against a numeric window,
  `maxIntroducedIn(catalog) <= declared <= VERSION`. Review found that a numeric interval is not a
  release register: `1.1.1` sits inside `[1.1.0, 1.2.0]` and names no release this pack has ever
  made. The draft had substituted an upper bound for a proof of existence, and had treated an
  unchanged `introducedIn` as proof of compatibility, which it is not. That defect and its correction
  are recorded here rather than smoothed away, because the reasoning is the thing this file exists to
  carry.
- **Revised a second time before merge, 2026-09-06.** Review of the first revision found three
  internal inconsistencies, not new counterexamples: D5 let `VERSION` resolve against an empty
  register while D1/D3/D4 required a register lookup and a digest of every other declaration, so
  equality was bypassing E1 and E2 through a side door; the revision silently narrowed E3 from the
  catalog to *"every rule the evaluation applied"*, making resolution depend on the target records;
  and D7 did not separate *absent* compatibility evidence from a *measured* digest mismatch, which
  are different faults. All three are corrected below, and recorded here for the same reason as the
  first.
- **Scope note.** This decides **what must be established before a declared version may be treated as
  resolved, and what happens when it cannot be** — the semantics and their falsifiers. It does
  **not** implement the check, and does not build the register it names; both are the implementation
  story, still deliberately unfiled. It does not reopen
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

**The malformed case is already correct.** The schema's semver pattern rejects it and
`predictions.mjs` exits 2 with *"A policy that cannot be read is a configuration fault, not a failing
prediction."* That is exactly the disposition this ADR would have chosen. **No work is required for
it**, and claiming otherwise would manufacture a defect to fix.

**Every other case publishes an authoritative `SUPPORTED` verdict stamped with a framework version
that was never applied — including one that has never existed.**

## Three things must be established, and they are not the same thing

The first draft's error was collapsing them. Resolution requires all three, conjunctively:

| | Establishment | The question it answers |
|---|---|---|
| **E1** | **Existence** | Does the declared version name a release this pack actually made? |
| **E2** | **Compatibility** | Is the catalog shipping now equivalent, over the rules that existed then, to the catalog that release shipped? |
| **E3** | **Introduction bound** | Did every rule in the catalog now shipping exist in the declared version? |

E3 is a necessary condition for E2 and not a substitute for it. **`introducedIn` records when a rule
was *added* and nothing records when one was *changed*.** A rule's `severity` could be raised, its
`nonExemptible` flipped, or its remediation rewritten between two releases, and every `introducedIn`
in the catalog would be identical across both. "No new rules" does not prove "the same rules."

### The counterexample the numeric window admits

```
D1 draft window       : [1.1.0, 1.2.0]
releases (CHANGELOG)  : 1.2.0, 1.1.0, 1.0.0
releases (git tags)   : v1.1.0, v1.2.0        <- v1.0.0 has no tag; F3 is held

1.1.0   inWindow=true    isARelease=true
1.1.1   inWindow=true    isARelease=false     <== accepted by the draft, names no release
1.2.0   inWindow=true    isARelease=true
```

A version number is dense; a release history is a finite set. No arithmetic over the endpoints can
distinguish them, so existence has to be looked up rather than bounded.

## What evidence the shipped pack actually has

The distinction that decides this ADR: **git history is not shipped.** `package.json` declares no
`files` allowlist and there is no `.npmignore`, so a consumer gets the working tree — `rules/`,
`standards/`, `VERSION`, `CHANGELOG.md`, `artifacts/integrity-baseline.json` — and **no tags, no
commits, no previous release**. The pack ships exactly one catalog and one protection baseline, both
current.

| Establishment | Shipped evidence | Verdict |
|---|---|---|
| **E3** Introduction bound | `rules/**.introducedIn` and `VERSION` | **Establishable today** |
| **E1** Existence | `CHANGELOG.md`'s `## [x.y.z]` headings — the only shipped release register. Tags are not shipped, and `v1.0.0` does not exist at all | **Partial, and prose** |
| **E2** Compatibility | **Nothing.** No per-release catalog digest is recorded anywhere | **Not establishable** |

**So on today's shipped evidence no declaration resolves at all — `VERSION` included.** That is the
honest reading of D1 and D5 together, and it is why the register is the first thing the
implementation must build rather than an enhancement to it. The falsifiers below describe the
behaviour of the check once that register exists; they are not assertions about the pack as it
stands today, where the answer to every declaration is *cannot be established*.

### What the ratchet does and does not give

`artifacts/integrity-baseline.json` carries `reviewedOn: 2026-08-09` — 1.1.0's release date — while
its `standardVersion` reads `1.2.0`, and `scripts/integrity.mjs` fails on any drift between that file
and the catalog. So the pack does ship evidence that **the protection attributes have not drifted
since 2026-08-09**.

That is real, and it is narrower than E2. It covers `level`, `nonExemptible` and `severity` only. It
says nothing about rule text, `remediation`, or the standards prose, and it is a claim about a date
rather than about a released version. It is a corroborating signal, not the proof.

### What the history happens to show, and why it is not evidence

Measured across every release transition this pack has:

```
v1.1.0 -> v1.2.0   rules/ and standards/ byte-identical; integrity-baseline.json differs by
                   exactly one line, the standardVersion identity field
1.0.0  -> v1.1.0   rules/falsifiability.json +48 (two new rules); baseline purely additive.
                   The only line ever removed from the baseline, in the pack's whole history,
                   is standardVersion itself
```

So every catalog change this pack has made has been purely additive, and `1.1.0` really is compatible
with `1.2.0` over the rules that existed. **That is a contingent fact about three releases, measured
from git, and the shipped pack cannot see any of it.** Using it as a proof would be exactly the
inference this ADR was revised to remove: it would work until the first release that revises a rule
in place, and it would fail silently then, because nothing would have changed in `introducedIn`.

## Decision

**D1 — A declared version resolves only when E1, E2 and E3 all hold.** No two of them substitute for
the third, and no numeric relation establishes E1 or E2.

**D2 — E3 is bounded above by `VERSION` and below by rule introduction, and the bound is
catalog-wide.** `declared <= VERSION`, because you cannot have been evaluated against a framework
that does not exist yet, and `introducedIn(r) <= declared` for **every rule `r` in the catalog**, not
merely for the rules a particular run happened to apply.

The first draft said catalog-wide; the first revision wrote *"every rule this evaluation applied"*
and dropped the decision without argument. That was a regression, and it is reversed here
deliberately. Three reasons, in order of weight:

- **A vacuous target would resolve anything.** Applicability is record-level
  ([ADR 0005](./0005-record-level-applicability-and-policy-parameters.md)), so a target with no
  records — or no records of the kind a rule governs — applies no rules, and a target-dependent bound
  is satisfied vacuously. A policy declaring `1.0.0` would resolve against an empty target and
  publish *"evaluated against 1.0.0"* having evaluated nothing.
- **Resolution would flicker with the data.** The same policy and the same pack would resolve today
  and stop resolving tomorrow because a record of a new kind was added. Whether a declaration is
  meaningful is a property of the policy and the pack; it must be answerable before a single record
  is read, and it must be the same answer for every target.
- **D8 already forbids the narrowing that would make the two readings agree.** The catalog is never
  narrowed to the declared version, so the evaluator always brings the whole catalog; a bound that
  only covers the rules that fired leaves the rest applied but unbounded.

Catalog-wide is strictly stronger — it implies the target-dependent condition for every target — and
it costs nothing legitimate: measured against this pack, `max(introducedIn)` over the shipping
catalog is `1.1.0`, so the `1.1.0` pin of A2 still resolves and the demonstrated `1.0.0` defect still
does not.

**D3 — E1 is established by lookup against a register of releases the pack ships, never by arithmetic
over version numbers.** A declared version absent from that register is unresolvable however
plausible its number.

**D4 — E2 is established by comparing a recorded per-release catalog digest against the catalog
shipping now, restricted to the rules that existed in the declared version.** Absent such a record,
E2 is **not established**, and the correct report is that it could not be established — never an
assumption that it holds.

*The comparison surface*, fixed here because it is semantics; its storage and serialisation are
implementation. Per released version the register records **the set of rule ids that release
shipped**, and for each id a digest over everything that determines what the rule requires and how
it is enforced — at minimum `level`, `severity`, `nonExemptible`, and the rule's normative text
(statement and remediation). E2 holds when **every recorded id is still present** and **every
recorded per-rule digest equals the digest computed from the catalog shipping now**.

- **A recorded id absent from today's catalog is a removal, and E2 fails.** This is how a rule
  deleted or renamed since the declared release is detected; a whole-catalog digest could report
  *that* something changed but not *what*, and set membership is what makes a removal nameable.
- **Ids present today but not recorded are outside E2's surface.** Rules added since the declared
  version are E3's business, not E2's, and failing E2 for them would double-count one fault.

*E2 has two failure modes and they are not the same fault*: **no digest is recorded** for the
declared release, and **a recorded digest does not match**. The first says the pack cannot answer the
question; the second says it answered and the catalog has changed. D7 requires them reported
separately.

**D5 — Equality with `VERSION` is not the rule, and `VERSION` is not exempt from the rule.** The rule
is D1, and it admits no special case. The first revision left one: it allowed the current version to
resolve against an empty register, on the reasoning that the resolvable set was merely *degenerate
for want of evidence*. That reasoning was wrong, and wrong in the direction this ADR exists to guard
against — it let equality with `VERSION` bypass E1 and E2 while every other declaration was held to
them.

There is no independent evidence that would justify the exemption. A shipped `VERSION` file asserts
what the working tree calls itself; it establishes neither that a release by that name was ever made
(E1) nor that this catalog is the one that release shipped (E2). Those are exactly the two questions,
and `VERSION` answers neither of them about itself.

So: **the register must record the current release, with its catalog digest, like any other.** Two
consequences, both intended:

- **A pack whose register omits the current release resolves nothing** — including a policy declaring
  `VERSION`. That is `NOT_EVALUATED` and exit 2 under D6: a pack that cannot say what it shipped
  cannot certify anything against it. Deletion must be strictly worse than maintenance, never a
  permissive default.
- **A catalog edited in place while `VERSION` stays unchanged fails E2 and does not resolve.** This
  is the case the exemption would have hidden, and it is worth having on its own merits: an
  unreleased edit to `rules/` would otherwise be published under the version name of the release it
  is no longer. It is wider than the ratchet, which sees only protection attributes.

The rule remains **not** equality: A2 requires `1.1.0` to resolve once the register records it and
the digest matches, with no change to this decision. A11 now falsifies the exemption rather than the
degeneracy, and A13 covers the changed-in-place current catalog.

**D6 — An unresolvable version is a configuration error, never a compliance failure.** It routes to
`NOT_EVALUATED` and exit 2, alongside the existing treatment of an unreadable or schema-invalid
policy. This is the disposition the schema already promised, the one `policy.mjs`'s exit contract
already draws (*"Invalid configuration is a `2`, never a `1`"*), and the one
[ADR 0010](./0010-the-aggregate-status.md) already ranks first in `AGGREGATE_PRECEDENCE` on the
grounds that it is the absence of a verdict rather than a milder one.

**D7 — Which establishment failed must be reported, and E2's two failures must be told apart.**
*"Names no release"*, *"no catalog digest is recorded for that release"*, *"the recorded digest does
not match"* and *"the catalog contains a rule newer than the declared version"* are four different
faults with four different remedies, and collapsing them would make the fault undiagnosable by the
person who has to fix it. In particular, **an absent digest does not establish that the catalog
changed** — it establishes only that the pack cannot say whether it did. Reporting the two as one
would convert missing evidence into a finding of change, which is the same substitution, running the
other way, that this ADR was revised to remove.

E1 is evaluated first and short-circuits: if the declared version names no release there is nothing
to compare a catalog against, and E2 and E3 are reported as *not attempted* rather than as failed.
If E1 holds, E2 and E3 are both evaluated and **every** failure is reported, because they are
independent — the trace below shows a case failing E3 while E2 holds, and a case failing E2 while E3
holds.

**D8 — Narrowing the catalog to the declared version is rejected.** It would require historical
catalogs the pack does not ship, and it is under-declaration in the form this repository already
refuses elsewhere: silently dropping rules so that a claim becomes true is the mechanism by which a
policy stops meaning anything.

**D9 — The three adoption archives are untouched and out of scope.** Measured: nothing outside
`artifacts/` references `artifacts/adoption/*project-policy.yml`; they are never live evaluator
input. They are frozen evidence of what was evaluated on a particular day, and the 2026-08-25 review
already ruled that rewriting them would destroy the record they exist to keep.

## The decision traced, case by case

Every case runs identically against any target, including one with no records — resolution is
answered before the first record is read (D2).

| Declared | E1 register lookup | E2 digest | E3 catalog-wide bound | Outcome |
|---|---|---|---|---|
| `1.2.0`, current | present | matches | `1.1.0 <= 1.2.0` ✓ | **resolves** |
| `1.2.0`, catalog edited in place | present | **mismatch** | ✓ | `NOT_EVALUATED` — E2 *changed* |
| `1.1.0`, legitimate pin | present | matches over 1.1.0's ids | `1.1.0 <= 1.1.0` ✓ | **resolves** |
| `1.1.0`, release named but no digest recorded | present | **not recorded** | ✓ | `NOT_EVALUATED` — E2 *unanswerable* |
| `1.0.0`, the demonstrated defect | present | matches — 1.1.0 was purely additive | `1.1.0 <= 1.0.0` ✗ | `NOT_EVALUATED` — E3 |
| a rule revised in place, `introducedIn` unchanged | present | **mismatch** | ✓ | `NOT_EVALUATED` — E2 *changed* |
| `1.1.1`, inside the numeric window | **absent** | not attempted | not attempted | `NOT_EVALUATED` — E1 |
| `9.9.9`, never existed | **absent** | not attempted | not attempted | `NOT_EVALUATED` — E1 |
| anything, register absent or empty | **absent** | not attempted | not attempted | `NOT_EVALUATED` — E1, **`VERSION` included** |
| `1.2`, malformed | — | — | — | refused at load, exit 2 (unchanged) |

Rows 5 and 6 are why the three establishments stay separate: `1.0.0` fails E3 with E2 intact, and a
rule revised in place fails E2 with E3 intact. Neither could be derived from the other.

**A consequence worth stating rather than leaving to be discovered:** because E3 is catalog-wide, a
pin to an older release survives releases that change nothing the catalog exposes, and is invalidated
by the first release that adds a rule. `1.1.0` remains declarable today because `1.1.0 -> 1.2.0`
added none; it would stop being declarable the day one is added. That is the correct outcome — the
alternative is applying a rule the policy never declared — but it means a pin is a claim with an
expiry the pack decides, not a permanent setting.

## Limits, stated rather than implied

**The register does not exist, and building it is implementation scope.** This ADR fixes what it must
establish — per released version, enough to answer E1 by lookup and E2 by digest comparison — and
deliberately does not design its format, location or generation. What it must not be is derived from
the working tree at run time, since a record that regenerates from the thing it is meant to check
cannot detect a change in it. That is the same reasoning
[Standard 18](../../standards/18-standards-integrity.md) already applies to the protection baseline's
absent `--write` flag.

**`CHANGELOG.md` is a weak source for E1.** Its headings ship and are parseable, but it is prose
maintained for humans, and nothing binds it to what was actually released — a release could be tagged
without a heading, or a heading written without a release. It is sufficient to *name* the releases
today and insufficient to *characterise* them, which is precisely the gap D4's digest closes.

**`v1.0.0` has no tag.** The pack's first release is recorded in `CHANGELOG.md` and in
`release/v1.0.0`, and not in the tag namespace, because F3 is held. Any register built for D3 must
take its release list from a source that does not assume a tag exists for every release. This is
noted as a constraint on the implementation; **it is not an argument for admitting F3**, and F3
remains held.

## Acceptance criteria — the falsifiers

Each states the observation that would show the decision wrong, red-first: the observation must be
constructed and seen to fail before the check exists.

| # | Case | Required outcome | Falsifier |
|---|---|---|---|
| A1 | Current self-policy, `1.2.0`, **with the register recording the current release** | resolves; evaluation proceeds | it does not resolve |
| A2 | Legitimate pin, `1.1.0`, **once the register records it and the digest matches** | **resolves** | it is rejected — equality has hardened into the rule |
| A3 | Stale, `1.0.0` | `NOT_EVALUATED`, exit 2, citing **E3 only** — E2 holds, the change was additive | a verdict is published; it is reported as a compliance failure; or E2 is blamed for an E3 fault |
| A4 | Future, `9.9.9` | `NOT_EVALUATED`, exit 2, citing E1 | `SUPPORTED` is published, as it is today |
| A5 | Malformed, `1.2` | refused at load, exit 2 | behaviour changes from what is measured above |
| A6 | `introducedIn` cross-check is catalog-wide | **every rule in the catalog** satisfies `introducedIn <= declared`, whether or not it fired | the bound is taken over the rules a run applied, so an unfired newer rule passes |
| A7 | Bounds are computed | changing the catalog's `introducedIn` values moves the E3 bound | any bound is a literal in the source |
| A8 | Disposition is not a failure | the outcome is `NOT_EVALUATED`, never `INSUFFICIENTLY_SUPPORTED` | it appears as a rule finding or reaches exit 1 |
| **A9** | **In-window nonexistent, `1.1.1`** | **`NOT_EVALUATED`, exit 2, citing E1** | **it resolves because it lies between two real releases — the exact defect this revision removes** |
| **A10** | **Rule revised in place**: an existing rule's `severity` changes while every `introducedIn` stays put | **E2 fails; `NOT_EVALUATED`** | the declaration still resolves, proving compatibility was inferred from `introducedIn` |
| **A11** | **`VERSION` is not exempt** | with the register empty or missing the current release, a policy declaring `VERSION` does **not** resolve — `NOT_EVALUATED`, citing E1 | it resolves anyway, so equality bypasses the establishments imposed on everything else |
| A12 | Faults are distinguishable | E1, E2 and E3 failures are separately identifiable in output | one generic "unresolvable version" for all three |
| **A13** | **Current catalog changed in place**: a rule is edited while `VERSION` and the register entry stay put | **E2 fails; `NOT_EVALUATED`, citing a digest mismatch** | it resolves, publishing the release's version name for a catalog that is no longer that release |
| **A14** | **Absent evidence is not a mismatch**: the register names the declared release but records no digest | `NOT_EVALUATED`, reported as **compatibility unanswerable**, distinctly from A10/A13's mismatch | the output claims the catalog changed, converting missing evidence into a measured finding |
| **A15** | **Resolution is target-independent**: the same policy against a full target, a partial target, and **a target with no records** | **identical resolution verdict in all three**; an empty target never resolves a declaration a full one rejects | a stale declaration resolves against the empty target — the bound was target-dependent and satisfied vacuously |
| **A16** | **Removed rule is detected**: a rule recorded for the declared release is deleted from the catalog | E2 fails, naming the missing id | it passes because the surviving rules all still match |

A2, A9 and A10 carry the first revision. **A10 is the one the first draft could not have passed**, and
it is the reason `introducedIn` is a necessary condition rather than the test. **A11, A13, A14, A15
and A16 carry the second**: A11 and A13 close the `VERSION` exemption, A14 keeps absent evidence
distinct from measured change, A15 pins resolution to the policy rather than to the records, and A16
covers the removal case the per-rule surface exists to catch.

## Held items, untouched

Restating the scope note because an accepted ADR is exactly when adjacent work starts looking
authorized. None of the following is promoted, started, or made more likely by this decision: the
CI-teardown ownership candidate, the non-squash merge-topology convention as a written convention,
the retroactive `v1.0.0` tag, or the stale-digest falsy read at `compliance.mjs:459`. The `v1.0.0`
tag is named above only as a constraint the register must accommodate, which is not evidence for
creating it. Each remains held until it independently earns entry on its own evidence.
