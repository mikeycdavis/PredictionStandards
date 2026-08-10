# Instructions

Operator guide for adopting the prediction standards in a project that produces predictions. This
document does not restate the standards — they are in [standards/](standards/) and are the
authority. This is how to run them.

> **Do not copy the standards documents into your repository.** A copied standard is a second
> definition that will drift from this one, silently, and the drift is invisible precisely because
> both copies read correctly. Copy [templates/](templates/); reference the standards.

---

## 1. What this evaluates

One **prediction record**: a JSON document describing a single prediction, or a single abstention,
together with the evidence claimed to support it. Not a model, not a repository, not a dataset. See
[docs/ml-vs-prediction-boundary.md](docs/ml-vs-prediction-boundary.md).

## 2. Minimum adoption recipe

```bash
# 1. Scaffold a policy and a template record into your project.
npx predictions init --dry-run          # see exactly what would be written
npx predictions init                    # write it

# 2. Edit project-policy.yml: set your thresholds and confidence vocabulary.

# 3. Emit one record per prediction, into a directory of your choosing.

# 4. Check them.
npx predictions check records/

# 5. Gate CI on step 4.
```

## 3. The commands

| Command | Job | Needs a policy? | Produces a verdict? |
|---|---|---|---|
| `init` | scaffold a policy and a template record | no | no |
| `audit` | what does this record contain, and where does it depart from the standards? | thresholds only | **no** |
| `check` | is this prediction sufficiently supported? | yes | **yes** |
| `explain` | why did each rule apply, and what was found? | yes | no |
| `status` | aggregate posture of a directory | yes | no |

`audit` and `check` are separate commands with different exit contracts, and no flag moves one into
the other. Evidence discovery and verdict are different jobs; a consumer that has to guess which one
it got will guess wrong. See [ADR 0007](artifacts/adr/0007-cli-command-design.md).

`audit` reads the policy's `parameters` block and nothing else — it needs your thresholds to observe
anything at all, but it does not read applicability, exceptions, or attestations, and it never
reaches a verdict.

## 4. Exit codes

| Code | Meaning |
|---|---|
| `0` | The command completed. For `check`, the records are supported. |
| `1` | The command completed. For `check`, at least one record is insufficiently supported or blocked. For `audit`, only with `--strict`. |
| `2` | No conclusion could be reached: bad invocation, unreadable record, missing or invalid policy. |

The 1/2 split matters to CI. `1` means the tool worked and the prediction has problems; `2` means it
could not reach a verdict at all. Collapsing them tells CI that a broken evaluator is a failing
prediction, and the usual response to that is to weaken the check.

## 5. Verdicts

| Verdict | What to do |
|---|---|
| `SUPPORTED` | Proceed. Note what was *not* evaluated before treating this as a clean bill of health. |
| `SUPPORTED_WITH_EXCEPTIONS` | Proceed, and check the exceptions have not quietly become permanent. |
| `INSUFFICIENTLY_SUPPORTED` | Fix the named rule, or replace the prediction with an abstention. |
| `BLOCKED_BY_INVARIANT` | **Stop.** See §8. |
| `NOT_EVALUATED` | Fix the configuration. This says nothing about the prediction. |

**`INSUFFICIENTLY_SUPPORTED` is narrower than it sounds, and the boundary surprises people.** A
record that predicts *while declaring the evidence inadequate* — unjustified critical gaps,
unaccounted staleness, an unjustified small sample, undeclared model disagreement — does not land
here. It violates `abstention.no-manufactured-prediction`, which is non-exemptible, so the verdict
escalates to `BLOCKED_BY_INVARIANT`.

That is correct by design rather than an accident of ordering. The first prohibition in the source
brief is manufacturing a prediction when the evidence does not support one, and a rule no policy can
waive is what a prohibition means here. So `INSUFFICIENTLY_SUPPORTED` covers evidence that is
*missing or malformed*, and insufficiency that is **the reason not to predict at all** is a stop
rather than a fix. The remedy is not a better record; it is an abstention.

## 6. Determinism

Pass `--as-of=<ISO instant>` to pin every staleness and expiry comparison. Without it the current
time is used. Pin it in tests and in any run whose output you intend to compare against another —
otherwise a record's verdict changes as it ages, which is correct behaviour and useless for
reproduction.

Every report states the `asOf` it used and the `parameters` it applied, so a verdict never rests on
a threshold the reader cannot see.

## 7. Writing a policy

Four mechanisms, deliberately not interchangeable:

| Mechanism | Claim | Effect |
|---|---|---|
| `rules` | this rule binds at this level here | changes the level |
| `applicability` | this rule has no subject in this project | rule is skipped, visibly, with a reason |
| `exceptions` | this rule applies and we knowingly do not satisfy it | rule is excepted, with an approver and an expiry |
| `attestations` | a human evaluated this rule and here is what they examined | rule passes on recorded human evidence |

Collapsing any two of them would let "we looked and it is fine" and "we did not look" produce the
same output.

**None of the four works on a non-exemptible rule.** An exception is rejected, a level override is
rejected, a not-applicable declaration is rejected, and each is reported as a violation of
`integrity.no-manipulation`.

**Thresholds live in `parameters`.** None of the defaults comes from the source specification:

| Parameter | Default | What it governs |
|---|---|---|
| `minSampleSize` | 30 | when a sample needs a justification |
| `disagreementThreshold` | 0.10 | when ensemble spread must be declared |
| `materialityThreshold` | 0.01 | when a small edge needs explaining |
| `tolerance` | 0.0001 | recomputation of edge, expected value, de-vigging |
| `defaultFreshnessWindow` | `P7D` | when data counts as stale |
| `confidenceVocabulary` | none | the tiers a record may use |

Set them from your domain. Thirty observations is comfortable for a stable high-frequency process
and hopeless for a rare event.

## 8. For AI agents

An agent using this pack can:

1. **Initialise** — `predictions init --dry-run`, then `init`.
2. **Determine what applies** — `predictions explain <record>` lists every rule as applicable,
   not-applicable (with the reason), attested, or not-evaluated.
3. **Explain why** — the same command gives each rule's evidence and remediation.
4. **Gather evidence** — a failing rule names the record field it read; a `not-evaluated` rule names
   what a human would have to attest to.
5. **Evaluate** — `predictions check`.
6. **Conclude** — one of `SUPPORTED`, `SUPPORTED_WITH_EXCEPTIONS`, `INSUFFICIENTLY_SUPPORTED`,
   `BLOCKED_BY_INVARIANT`, `NOT_EVALUATED`, plus per-rule `not-applicable` and `not-evaluated`.
7. **Recommend remediation** — every rule carries a `remediation` string.
8. **Re-evaluate on change** — re-run `check`; attestations go stale automatically when what they
   reviewed changes.

**You are never required to produce a positive recommendation.** Two refusals are first-class:

- **Abstention.** When the evidence does not support a prediction, emit an abstention record. A
  well-formed one reaches `SUPPORTED` — the same verdict a well-evidenced prediction reaches. It is
  not a failure and does not score worse.
- **`BLOCKED_BY_INVARIANT`.** When this verdict appears, **stop and report it.** Do not adjust the
  policy, lower a threshold, edit the record's declarations, or re-run with different flags until
  the verdict changes. Doing any of those is itself the violation
  ([Standard 18](standards/18-standards-integrity.md)), and it is the violation this pack most
  directly addresses to you.

If a rule seems wrong for your domain, say so and leave it failing. Changing it is a decision
someone should make in the open, with the baseline edit and the changelog entry that go with it.

## 9. Current limits of the tooling

Stated plainly, because a check that overstates what it establishes is worse than no check.

- **Four rules have no detector.** The three outcome-bias and lookahead-evaluation rules concern how
  people reason about resolved predictions, and no outcome is recorded anywhere. `integrity.no-manipulation`
  is partly automated. All four are `not-evaluated` until attested.
- **Declaration checks cannot see past the declaration.** Most rules confirm a statement exists, not
  that it is true. A record that files decisive information under `knownGaps` passes
  `data.missing-critical-blocks`.
- **Cherry-picking is only visible when disclosed.** A model run and silently dropped leaves no trace.
- **Vig removal is verified for the proportional method only.** `power` and `shin` are presence-checked.
- **The precision bound assumes independent observations.** Correlated data inflates precision undetected.
- **A methodology change is only detectable across records sharing a `seriesId`, evaluated together.**
- **Regime change cannot be detected from a single record**, in principle.

Every one of these is recorded in the relevant rule's `$assuranceNote`, so a machine consumer reading
rule metadata gets the same caveat you just read.

## 10. Framework coverage

Every report carries `frameworkCoverage` **beside** the verdict and never inside it: 47 of 52 rules
have a detector, 16 of 19 standards are fully machine-represented. Combining the two numbers would
let a tooling improvement look like a support improvement. `SUPPORTED` means everything checked
passed — not that everything conceivable was checked.
