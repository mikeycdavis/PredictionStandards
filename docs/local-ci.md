# Local CI, and verified pull requests

GitHub remains the source of truth for code, pull requests and review. What it is no longer
required for is *proving that a branch passes its checks*. The complete pipeline runs in Docker on
the developer's machine, before the branch is pushed, and a pull request may only be opened for a
commit that pipeline has actually verified.

The invariant, stated once:

> **The commit pushed for a pull request is exactly the commit that passed the complete local
> Docker CI pipeline.**

Everything below exists to make "exactly" true rather than approximately true.

## Prerequisites

| Tool | Why | Notes |
|---|---|---|
| Docker | Runs the pipeline | The only thing the pipeline needs. Node, npm and the test runner all live in the image |
| Git | Identifies the commit | — |
| Node | Runs the submission harness on the *host* | Only `scripts/submit-pr.mjs` and a one-line read of `package.json`; the checks themselves never use it |
| GitHub CLI (`gh`) | Opens the pull request | Optional. Without it the verified commit is still pushed and you open the PR by hand |

There is nothing to install and nothing to restore. This repository has no third-party
dependencies, by the decision recorded in [PROJECT.md](../PROJECT.md), so there is no lockfile,
no `npm ci`, and no cache to warm.

`gh` uses your existing authenticated session. No token is read, written, or stored by anything in
this repository, and none belongs in it.

## Running CI

```powershell
.\scripts\ci.ps1
```

```bash
./scripts/ci.sh
```

Exit code `0` means every stage passed. Any other value means it did not, and nothing downstream
treats it as anything else.

Options, and there are deliberately only two:

| Option | Effect |
|---|---|
| `--verbose` | Stream every stage's output as it runs, not only a failing stage's |
| `--keep-on-failure` | Leave the container and network in place after a failure, for debugging |
| `--json` | Emit the result document on stdout. Under this flag the human narration goes to stderr, so `\| jq .` works |

**There is no option that runs a subset of the pipeline**, and no option that skips it. A flag that
shortened the run would produce a green result meaning something other than what the reader
assumes, and the first response to a red pipeline would be to reach for it. A test asserts against
the source that no such flag exists.

## What CI checks

Eight stages, in this order:

```text
inventory   the reviewed source inventory still matches the sources
fidelity    quoted prohibitions still say what the source said
integrity   the standards-integrity ratchet — no rule weakened in silence
policy      this repository's own project-policy.yml is valid and compliant
diagrams    every .mmd matches the copy embedded in Markdown
test        node --test — 209 tests
audit       survey the example records
check       the verdict on the example records
```

The order is load-bearing. The invariant checks run before the tests because each guards an
assumption the tests rest on; `check` runs last because it is the only stage that produces a
verdict.

**The stage list lives in exactly one place** — `ci.stages` in [package.json](../package.json) —
and the command each stage runs is the npm script of the same name. `scripts/ci.mjs` resolves one
against the other at run time, so a stage naming a script that does not exist is an invocation
error rather than a silently skipped check.

Nothing else defines the pipeline. The GitHub workflow invokes `scripts/ci.sh`; the README points
at it; this document describes it. None of them restates it.

## Submitting a verified pull request

```powershell
.\scripts\submit-pr.ps1
```

```bash
./scripts/submit-pr.sh
```

The whole workflow is:

```text
make changes  ->  git commit  ->  submit-pr
```

and the command does the rest:

```text
verify this is a git repository
        |
        v
verify the branch may be submitted from      (never main, never the base itself)
        |
        v
reject a dirty working tree                  (untracked files count)
        |
        v
record HEAD
        |
        v
run the full Docker pipeline
        |
   PASS |  FAIL -> "CI failed. No branch was pushed and no PR was created."
        v
resolve HEAD again, and compare
        |
  SAME  |  CHANGED -> "HEAD changed after CI verification..."
        v
push the SHA, not the branch                 git push origin <sha>:refs/heads/<branch>
        |
        v
gh pr create, with the verification appended to your description
```

| Option | Effect |
|---|---|
| `--base <branch>` | The branch to merge into. Default `main` |
| `--title <text>` | PR title. Omitted, `gh pr create --fill` takes it from the commits |
| `--body <text>` | Your description. The verification block is **appended**, never substituted for it |
| `--draft` | Open as a draft |
| `--dry-run` | Verify and report; push nothing, create nothing |
| `--verbose` | Stream every CI stage's output |

It never commits, stages, stashes or amends anything to make the pipeline pass, and never pushes
after a failed or unverified run.

**Re-running on a branch that already has a pull request replaces the verification block** rather
than leaving the old one in place. Pushing a newly verified SHA to a PR whose body still names the
previous one produces a stale receipt — the head commit and the commit the body claims was verified
are different objects, and the body is the more convincing of the two because it is prose. Your
description is preserved; only the block is refreshed, and a refresh that fails is reported rather
than swallowed.

### Why three separate checks, and not one

Running CI and then pushing is not the same as pushing what CI verified. A pipeline takes minutes.
An editor autosaves, a hook amends, a rebase lands — and the branch that reaches the remote is a
commit no check ever saw, while the transcript still shows a green run immediately above a
successful push. Nothing about that sequence looks wrong afterwards.

1. **The clean-tree requirement is not hygiene.** CI verifies the tree that is bind-mounted into
   the container. A dirty tree means the pipeline certified something that is not the commit.
   Requiring a clean tree before the run is what makes "the tree" and "the commit" the same object
   for the duration. Untracked files count, because an untracked file is absent from the commit and
   present in the mount, and can change the result.
2. **`HEAD` is compared as a full 40-character string.** A prefix or abbreviated comparison would
   pass on a truncation.
3. **The push names the SHA rather than the branch.** `git push origin <branch>` publishes whatever
   the branch points at *now*; `git push origin <sha>:refs/heads/<branch>` can only publish the
   object that was verified.

The tree is re-checked after the run too: a tree that goes dirty mid-run leaves `HEAD` untouched,
so the SHA comparison alone would not notice.

## Verification evidence

A successful run prints the repository, branch, verified SHA, result, the stages executed, the
image digest, and a completion timestamp. It also writes:

```text
artifacts/local-ci/latest.json
```

```json
{
  "repository": "PredictionStandards",
  "branch": "chore/local-docker-ci",
  "commit": "<full SHA>",
  "result": "passed",
  "environment": "docker",
  "startedAt": "...",
  "completedAt": "...",
  "checks": [{ "name": "inventory", "result": "passed", "durationMs": 195 }]
}
```

Stages that never ran after a failure are recorded as `"not-run"` rather than omitted, so an unrun
check and a passing check cannot look the same to a reader.

**The file is gitignored.** It is evidence of a verification, not a verification: it records what
happened on one machine at one moment, and committing it would invite a reader to trust the file
instead of re-running the pipeline. The pipeline is cheap; the file is not authority.

`submit-pr` reads it back and refuses to push if it is missing, unreadable, not `passed`, or
describes a different commit.

## Isolation

**The repository is mounted read-only.** This is the isolation boundary doing real work rather than
ceremony: the pipeline cannot modify the tree whose commit it is about to certify, so "CI passed,
then something changed the source" is not a state reachable from inside a run. Everything a run
writes goes to a tmpfs `/tmp` or to `/out`, the single writable mount, which is
`artifacts/local-ci/`.

**Each run gets a unique compose project name** — `predictionstandards-ci-<id>`. Every container,
network and volume is namespaced under it, which is what makes teardown safe. Teardown is
`docker compose -p <project> down -v --remove-orphans`, which can only reach resources that run
created. No `docker system prune` and no bare `docker rm` appears anywhere in this repository, so
your own containers, volumes and databases are outside what this can touch even on the failure
path.

**On POSIX hosts the container runs as your uid.** The image's `node` user is uid 1000; a
GitHub-hosted runner is uid 1001 and a Linux developer may be anything. `artifacts/local-ci` is
created by the host user with ordinary permissions, so a container running as a different uid cannot
write the evidence — and that failure is quiet in the worst way: the pipeline warns and still exits
0, then `submit-pr` refuses because the evidence it needs is missing. `scripts/ci.sh` passes
`--user "$(id -u):$(id -g)"`, which removes the mismatch instead of loosening permissions on the
directory. Windows has no meaningful uid to pass and Docker Desktop's bind mounts are permissive, so
`scripts/ci.ps1` leaves the image's own `USER` in place.

**The container gets no network and no Docker socket.** `network_mode: none`, because nothing in
this pipeline serves or fetches anything; no socket, because handing a test process the daemon
socket hands it the host.

**The image is pinned by digest**, not by tag. `node:20-alpine` resolves to a different image after
any upstream rebuild, and a toolchain that changes without a commit makes a green result mean
something different on Tuesday than it did on Monday. The digest appears in both `package.json`
(`ci.image`) and `Dockerfile.ci`; the runner refuses to start when the two disagree, and a test
asserts both are digest-pinned.

### Databases

**This repository has no database, and CI provisions none.** Every check is a pure function of the
tracked files: the standards, the rule catalog, the schemas and the example records are all files
in the repository, and the tests that need scratch space create it under the OS temp directory,
which is a tmpfs inside the container and does not survive the run.

So there is no test database to isolate, no migration to apply, no seed data, and nothing in
`compose.ci.yml` beyond the `ci` service itself. That absence is recorded rather than left to be
inferred, because a `depends_on: { condition: service_healthy }` block here would assert a
robustness the pipeline has no occasion to need. If a dependency is ever added it belongs in
`compose.ci.yml` with a real healthcheck, and the runner already waits on compose's own readiness —
an arbitrary sleep would not be an acceptable substitute.

## When something fails

Cleanup runs on success, on failure, and on interrupt. The teardown is in a `finally` block in
`scripts/ci.ps1` and a `trap` in `scripts/ci.sh`, so a failing stage, a `Ctrl-C` and a crashed
container all leave the same amount behind: nothing except the run evidence.

To debug:

```powershell
.\scripts\ci.ps1 --keep-on-failure --verbose
```

`--verbose` streams every stage rather than only the failing one. `--keep-on-failure` leaves the
container in place and prints the two commands you need:

```text
docker compose -p predictionstandards-ci-<id> -f compose.ci.yml ps
docker compose -p predictionstandards-ci-<id> -f compose.ci.yml down -v --remove-orphans
```

To get a shell in the same environment the pipeline ran in:

```bash
docker compose -f compose.ci.yml run --rm --no-deps ci sh
```

Remember that `/workspace` is read-only in there. That is deliberate, and if a check needs to write
somewhere it should write under `/tmp`.

The build cache and the `predictionstandards-ci:local` image tag are left in place between runs.
They are cached build inputs, not run state, and removing them would only cost a rebuild.

## Local CI is not GitHub Actions

The two answer different questions, and the pull request body says which one it is reporting.

| | Local Docker CI | GitHub Actions |
|---|---|---|
| Proves | the author verified the commit they pushed | the commit verifies somewhere that is not the author's machine |
| Runs on | your workstation, your working tree | a clean clone, hardware nobody was working on |
| Required to open a PR | **yes** | no |
| Blocked by billing or quota | no | possibly |

`scripts/submit-pr.mjs` appends a block naming the verified SHA, the result, and the image digest,
and states in as many words that it is a local run and **not** a GitHub-hosted Actions result. A
test asserts the wording never claims otherwise. Local CI has no dependency on
`.github/workflows/ci.yml`, so if hosted Actions cannot run — quota, billing, a private repository
out of minutes — nothing here is affected.

The workflow runs `./scripts/ci.sh`, the same entry point. Adopting a self-hosted runner later is a
change of `runs-on` and nothing else; no part of the pipeline would need redesigning.

## Reusing this in another repository

Four of the five moving parts are repository-agnostic: `scripts/ci.mjs`, `scripts/ci.ps1`,
`scripts/ci.sh`, `scripts/submit-pr.mjs` and its two wrappers make no reference to what this
repository checks. `compose.ci.yml` and `Dockerfile.ci` carry only the image and the mount layout.

The repository-specific part is the `ci` block in `package.json`:

```json
{
  "ci": {
    "image": "node:20-alpine@sha256:...",
    "stages": ["inventory", "fidelity", "integrity", "policy", "diagrams", "test", "audit", "check"]
  }
}
```

Adopting the pattern elsewhere means copying the files and writing that block. A repository with a
database would additionally add the service and its healthcheck to `compose.ci.yml` — the runner's
lifecycle and the submission guard would not change.
