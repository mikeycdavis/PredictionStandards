# Release candidate review — `feat/aggregate-status` against frozen `v1.1.0`

- **Reviewed:** 2026-08-23
- **Candidate tip:** `b6027c7` (`feat/aggregate-status`)
- **Frozen baseline:** `v1.1.0` = `ebe232b`
- **Current `main`:** `99300b6` — an ancestor of the candidate, so the merge is a fast-forward and
  `HEAD..main` is empty
- **Proposed release:** **1.2.0** — a **minor** bump
- **Verdict:** **READY**

This decides a release number and nothing else. It does not modify `VERSION`, tag, merge, or push,
and it creates no backlog item; the backlog question is dispositioned in words below and left for a
separate act.

---

## 1. What is in the candidate

Twenty-two commits, `ebe232b..b6027c7`, in three groups. The first group is already on `main`.

### Group A — local Docker CI and verified submission (merged in PR #1, on `main`)

| Commit | |
|---|---|
| `7d4dca4` | Reconstruct the backlog from shipping evidence |
| `904d42a` | Fix a test command that could not have run on the Node CI declares |
| `62005e8` | The pipeline is defined once, in `scripts/ci.mjs` |
| `c9538ff` | The pipeline runs in an ephemeral container, and cannot write to the tree |
| `2a623d7` | Submission verifies the exact commit, and the guard is tested by the pipeline |
| `b5ed7df` | One authoritative pipeline: the workflow invokes it rather than restating it |
| `caf4959` | Document local CI, the isolation model, and the exact-commit invariant |
| `8585314` | Address PR #1 review: the test command was wrong in the mirror-image way |
| `a5117b1` | Hosted CI ran, and failed on a lost executable bit |
| `99300b6` | Merge pull request #1 |

### Group B — the aggregate status (ADR 0010)

| Commit | |
|---|---|
| `acdf0b2` | ADR 0010: the aggregate status, and why unknown outranks blocked |
| `ed9c9d7` | Red: what an aggregate status must mean before anything computes one |
| `6b9ce95` | Green: one authoritative disposition over a checked set |
| `865a670` | Record the envelope-versioning finding rather than solving it here |

### Group C — the adapter, the drain fix, and the envelope contract (ADR 0011)

| Commit | |
|---|---|
| `7a921b6` | The changelog stops denying a change the envelope actually made |
| `d9391a7` | A verdict that arrives in two pieces is not a verdict — the stdout-drain fix |
| `25d8330` | Declare how this pack is invoked, now that it has a verdict to declare |
| `d548a84` | Stop a checkout deciding whether the vendored schema still matches |
| `4ada3b9` | ADR 0011: what the envelope version promises, and why `status` earns a minor |
| `5899b65` | Red: a version that describes a shape nothing has written down |
| `f42c3b0` | Green: the envelope version now names a contract that can be checked |
| `b6027c7` | The finding stops saying nothing is implemented, now that it is |

---

## 2. The complete user-visible delta

### New capability

1. **An authoritative aggregate `status` on `check --json` and on `check`'s text output.** One
   disposition over the checked set, folded from per-record statuses and nothing else, worst first
   with `NOT_EVALUATED` ahead of `BLOCKED_BY_INVARIANT` (ADR 0010). Emitted by `check` alone.
2. **Parse-error normalisation.** An unreadable record now carries `status: "NOT_EVALUATED"` in the
   JSON. It always counted as not-evaluated and always printed as such; the JSON was the one of
   three channels that stayed silent.
3. **`standards-adapter.json`.** This pack's declaration of how StandardsEnforcer invokes it and
   reads the answer, at adapter `schemaVersion` 1.0.0. Executed against the vendored upstream schema
   rather than restated, with provenance recorded in `schemas/vendor/provenance.json`.
4. **`schemas/report.schema.json` and report envelope version `1.1.0`.** The envelope acquires a
   definition and a compatibility promise (ADR 0011), validated in CI against real output of all
   four commands.
5. **A local Docker CI pipeline** (`scripts/ci.mjs`, `ci.ps1`, `ci.sh`, `Dockerfile.ci`,
   `compose.ci.yml`) and **verified PR submission** (`scripts/submit-pr.mjs`), with the stage list
   defined once in `package.json`.
6. **Documentation:** `docs/json-output.md` (the machine-consumer interface, including what the
   status does *not* license), `docs/local-ci.md`, ADRs 0010 and 0011, and the backlog reconstruction
   under `artifacts/backlog/`.

### Defects fixed

7. **A large `--json` report was truncated in transit.** `process.exit` does not wait for a pipe to
   drain; on Linux a ~250 KB report arrived as a ~214 KB well-formed prefix. Invisible on a Windows
   console and reproduced every time in the container. This is the defect that made the adapter's
   promise false in production, and it was found because the container was finally run.
8. **`npm test` could not have run on the Node the CI declared** — a glob in `--test` that needs a
   newer runner than Node 20.
9. **A lost executable bit broke hosted CI**, fixed by invoking `sh ./scripts/ci.sh`.

### Behaviour removed or changed

10. **`predictions policy --json` no longer carries `schemaVersion`.** The only removal anywhere in
    the delta. See §3.
11. **Report `schemaVersion` `"1.0"` → `"1.1.0"`.** A changed value of an existing key.

---

## 3. Compatibility assessment

Measured against `v1.1.0` by running both versions over the same corpora at a fixed `--as-of`, not
inferred from the diff.

### Exit codes: unchanged

`check`, `audit`, `explain`, `status` over `examples/records` all exit `0` on both. Over the
mixed unreadable-plus-blocked corpus both exit `2`. The exit derivation is textually unchanged; the
parse-error record reaches `aggregate.notEvaluated` by a different route and lands on the same count.

### `check --json`: purely additive

```
top-level keys added   : ["status"]
top-level keys removed : []
record keys added      : [] (readable records) / ["status"] (parse-error records)
record keys removed    : []
aggregate              : identical
all other content      : byte-identical
```

The only differences in the entire document are the added `status`, the added per-record `status` on
parse-error entries, and the version string. Nothing a `v1.1.0` consumer read has changed value,
type, or meaning.

### `check` text output: purely additive

One `Status:` line and a seven-line boundary note. No existing line changed.

### `policy --json`: one key removed

```
old: [schemaVersion, policy, status, errors, findings]
new: [              policy, status, errors, findings]
```

**This is the one candidate for a major bump, and it is the decision that needed evidence rather
than an opinion.** The evidence: `predictions policy --json` is not documented as an interface
anywhere in the repository at `v1.1.0` — not in the README, not in `docs/`, not in the changelog.
The only two mentions that exist anywhere are the ones this branch added, and both say it is *not*
the report envelope. The removed field was an undocumented key on an undocumented output, and what
it asserted was false: it labelled a document whose `status` is `ok`/`findings`/`invalid` with the
version of a document whose `status` is a verdict.

So no stated commitment was withdrawn. This is a correction to a misstatement on a surface the pack
never published, which is exactly the distinction ADR 0011 D1 draws between documented and
undocumented keys — applied to the pack's own version rather than to the envelope's.

**Recorded so it can be disagreed with:** if the project's position is that any field ever emitted by
the CLI is part of the public interface regardless of documentation, then this is a breaking change
and the release is `2.0.0`. That reading is available and this review does not take it, because a
promise nobody ever made cannot be broken and treating it as one would make every future correction
of an untrue field a major release.

### Module exports

`REPORT_SCHEMA_VERSION`, `AGGREGATE_PRECEDENCE`, `aggregateStatus`, `AGGREGATE_NOTE` and a now-exported
`STATUS_NOTE` are additions. `package.json` is `"private": true` with no `exports` map and a `bin`
entry only, so the module surface is not a published interface; the additions are noted, not counted.

### The normative surface: untouched

`git diff v1.1.0..HEAD` over `standards/`, `rules/`, `VERSION`, `examples/`, `templates/`,
`artifacts/integrity-baseline.json`, `schemas/prediction-record.schema.json`,
`schemas/project-policy.schema.json` and `project-policy.yml` is **empty**. Still 19 standards and
52 rules, with every protection attribute unchanged. No rule was weakened, so nothing engages the
Standard 18 ratchet.

---

## 4. The version decision: 1.2.0, minor

### What the number has to denote here

`test/instructions.test.mjs` asserts `package.json.version` = `VERSION` =
`artifacts/integrity-baseline.json.standardVersion`, and that the changelog mentions it. The
repository therefore has **one number serving as both the normative standards version and the
version of the distributed artifact**, enforced by a test.

That matters, because the two pull in opposite directions this cycle:

- **As a standards version**, nothing happened. No standard, no rule, no protection attribute moved.
- **As an artifact version**, a great deal happened: a new published field, a new declaration file, a
  new schema, a delivery defect fixed, and a whole verification pipeline.

### Why minor, and why not the alternatives

**Not patch (`1.1.1`).** A patch says nothing was added. `check --json` gained an authoritative
verdict field, the pack gained an adapter declaration that lets an external enforcer consume it at
all, and the envelope gained a contract. Calling that a patch would make the version unable to
distinguish a bug fix from the release that made this pack machine-consumable — and would leave the
truncation fix and the new interface behind the same number.

**Not major (`2.0.0`).** No documented commitment was withdrawn, no exit code moved, no key a
`v1.1.0` consumer read changed value or meaning, and an unmodified corpus produces an identical
verdict with identical counts. The single removal is dispositioned in §3. A false major carries the
same cost as a false green: it tells every adopter to stop and re-read a document in which nothing
they were relying on changed, and it would fire here for a field that was never true.

**Minor (`1.2.0`)** is what the evidence supports: additive user-visible capability, backward
compatible on every documented surface, no normative change.

### Deliberately not derived from the envelope's number

The envelope moved to `1.1.0` this cycle. That is a **different stream** — ADR 0011 D6 lists four
that evolve independently — and the coincidence that both are minor bumps is a coincidence. The
release number is minor because the *artifact* gained capability without breaking a commitment, not
because the envelope did. Reading one from the other is how streams silently fuse.

### A finding this raises, and does not resolve

**The repository has one version number doing two jobs, and this is the first cycle where they
disagree.** `## [1.2.0] — Standards version 1.2.0 (no normative change), report schema 1.1.0, record
schema 1.1.0` is a heading that has to explain itself, which is a signal.

Recorded as a **candidate for a future cycle, not opened here**: whether the standards series and the
distributed pack should carry separate versions. It earns entry on its own evidence if it does, and
it does not enter this release by adjacency. Shipping 1.2.0 under the current single-number scheme is
correct today; the scheme's strain is a separate question from this release's number.

---

## 5. Pre-existing defects found by this review

Both predate the candidate — they were true at `v1.1.0` — so neither was introduced here. Both are
recorded rather than fixed, because this is a review.

1. **`README.md:175` states "Version 1.0.0"** while `VERSION` and `package.json` have said `1.1.0`
   since the last release. The version-agreement test covers `VERSION`, `package.json`, the baseline
   and the changelog, and does not cover this sentence, which is why it survived a release.
   **It must be corrected as part of the 1.2.0 bump**, and the agreement test should be extended to
   cover it, or the same sentence will be wrong again after the next release.

2. **`project-policy.yml:17` declares `standardVersion: "1.0.0"`** while the pack is at `1.1.0`. This
   repository is its own first adopter, so this is either a deliberate statement that it has not
   re-adopted the 1.1.0 series or a stale value nobody moved. `templates/project-policy.yml` says the
   same. It changes no verdict — the field is echoed into the envelope's `standardVersion` and gates
   nothing — but the pack's own reports currently claim conformance to a series it has since
   extended. **A decision is required; a change may not be.** Not a blocker for this release.

---

## 6. Held candidates: none entered scope

Checked individually against the tree, not assumed from intent.

| Held item | Status | Evidence |
|---|---|---|
| CI-teardown ownership standard | **still held** | `standards/` and `rules/` are byte-identical to `v1.1.0`; 19 standards, 52 rules |
| Non-squash merge-topology convention | **still held** | no occurrence in `README.md`, `docs/`, `CHANGELOG.md`; the only mentions in the tree are the "held items, untouched" sections of ADRs 0010 and 0011 |
| Retroactive `v1.0.0` tag | **still held** | `git tag -l` returns `v1.1.0` only |
| Stale-digest falsy read | **still held** | `scripts/compliance.mjs:459` still reads `if (current && current !== against.digest)`, unchanged; only its line number moved |

The two ADRs each carry an explicit "held items, untouched" section stating that adjacency is not
evidence. That held across two cycles that ran directly alongside all four.

---

## 7. Verification

### Clean-tree re-runs at the candidate tip

| Pipeline | Result | Detail |
|---|---|---|
| Host — `node scripts/ci.mjs` | **PASS 8/8** | working tree clean before and after |
| Container — `scripts/ci.ps1` | **PASS 8/8** | commit `b6027c7`, `node:20-alpine@sha256:fb4cd12c…72293`, completed 2026-08-23T20:01:53Z |

Stages: inventory, fidelity, integrity, policy, diagrams, test, audit, check. The container mounts
this repository read-only with `network_mode: none` and no Docker socket, so the run cannot modify
the tree whose commit it certifies.

Both environments are required and neither is sufficient. The last cycle reported green on the host
alone, and the container is what found the truncation defect in §2.7.

### Unintended changes: none

- `git status` clean; the only ignored path is `artifacts/local-ci/`, which is evidence of a run
  rather than a verification and is deliberately not committed.
- `git diff --check v1.1.0..HEAD` reports one item: a trailing blank line at EOF in
  `artifacts/backlog/README.md`, which is a **generated** file. Cosmetic, generator-owned, not fixed
  by hand.
- No credential-shaped content anywhere in the delta. `scripts/submit-pr.mjs:339` states the
  invariant it keeps: `gh` uses the developer's own authenticated session, and no token is read,
  written, or stored.
- `HEAD..main` is empty, so the candidate contains all of `main` and the merge is a fast-forward.

### Hosted CI: NOT_EVALUATED for this candidate

Recorded honestly rather than inferred from the local runs.

- Hosted CI **passed on `main` at `99300b6`** (run `31956341542`, 2026-08-16). Group A is
  hosted-verified.
- The twelve commits since — Groups B and C — have **never run on hosted CI**. The workflow triggers
  on `push` to `main` and on `pull_request`, and this branch is neither.

This is an unknown, not a pass, and it is not a blocker: the release process of record (ST-13) is
local verification re-run from `main` after the fast-forward, and hosted CI will run on that push.

---

## 8. Backlog disposition

**Decision: yes, this cycle should be represented — and only after the release lands, not now.**

The gap is real and currently misstates the project. `artifacts/backlog/README.md` reads *"13 of 13
leaf items complete — 100%"*, and the tree contradicts it: twelve commits of user-visible change,
two ADRs, a new schema, a new declaration file and a fixed delivery defect are represented by no
item. The backlog is a record of shipped work, and a record that stops before the last two cycles
reports completeness it does not have.

**The governing precedent is ST-13's, and it is satisfied here.** ST-13 recorded that *releases are
earned by new evidence, not generated because the version number has been sitting still*, and that
v1.1 was closed at the tag with no v1.2 backlog opened. That was correct: at the tag there was no
evidence. There now is — three adoptions' worth of consequence, an external consumer that did not
previously exist, and a defect found by running the pipeline somewhere new. This cycle is
evidence-earned, which is exactly the condition ST-13 set for the next one.

**TH-01 is neither reopened nor closed.** It is `IN_PROGRESS`, which is already correct: it is a theme
that outlives any release, and its own notes say so. Its `13/13` roll-up will move when new leaves
land beneath it, which is the roll-up working rather than bookkeeping applied to it. Touching TH-01
directly to make a number look right would be editing the derived thing instead of the source.

**Proposed shape, to be created under a separate instruction:**

```
IN-04  Machine-consumable enforcement
  EP-04  A verified local pipeline and verified submission        [Group A, already on main]
    FE-07  The pipeline defined once and containerised
      ST-14  Define the pipeline in scripts/ci.mjs and invoke it from the workflow
      ST-15  Run it in an ephemeral, read-only, networkless container
      ST-16  Submission that can only carry a verified commit
  EP-05  A verdict an external enforcer can read
    FE-08  The aggregate status                    → ST-17  (ADR 0010)
    FE-09  The adapter declaration                 → ST-18  (incl. the stdout-drain fix)
    FE-10  The report envelope contract            → ST-19  (ADR 0011)
  EP-06  Publication of 1.2.0
    FE-11  Freeze, verify from main, tag           → ST-20
```

Each leaf carries its commits as `evidence:`, in the form ST-13 already uses. The index is
regenerated, not edited: `node ~/.claude/skills/backlog-validate/scripts/backlog.mjs` rewrites
`artifacts/backlog/README.md` in place.

**Sequencing.** After the release, not before. Writing ST-20 "freeze, verify from `main`, tag 1.2.0"
as `COMPLETE` before the tag exists would put a claim in the backlog ahead of its evidence, which is
the one thing this backlog has never done.

---

## 9. Remaining work before the tag

Ordered. All of it is outside the stop line this review was asked to observe.

1. Set `VERSION` to `1.2.0`, and with it — because a test binds them — `package.json.version` and
   `artifacts/integrity-baseline.json.standardVersion`. The baseline's `rules` block is **not**
   touched; no protection attribute changed.
2. Correct `README.md:175` from `Version 1.0.0`, and consider extending the version-agreement test to
   cover it (§5.1).
3. Cut the `[Unreleased]` section to `## [1.2.0] — 2026-08-23`, with the stream line naming all four:
   standards 1.2.0 (no normative change), report schema 1.1.0, record schema 1.1.0, adapter
   schemaVersion 1.0.0.
4. Decide `project-policy.yml`'s `standardVersion` (§5.2) — a decision, possibly not a change.
5. Fast-forward `main` to the candidate, then **re-run both pipelines from `main`**, per ST-13.
6. Tag `v1.2.0`, annotated. Push.
7. Then, and only then, create the backlog items in §8.

Nothing in 1–4 changes behaviour; they are the release's own bookkeeping, and they are why the
verdict below is about the candidate rather than about the tag.

---

## 10. Verdict

**READY** — as a release candidate for **1.2.0**.

The code is green in both required environments from a clean tree at `b6027c7`. The user-visible
delta is additive on every documented surface, measured rather than argued. Exit codes, verdicts and
counts are identical for an unmodified corpus. The normative surface is untouched, so no rule was
weakened and the integrity ratchet is not engaged. No held candidate entered by adjacency. No
unintended change, no credential, no stray artifact.

Two things are true and neither blocks it: hosted CI has not seen this candidate and is recorded as
**NOT_EVALUATED** rather than assumed, and the release's own bookkeeping in §9 is not done — which is
precisely the work this review was told to stop before.
