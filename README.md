# Prediction Standards

> Whether an individual prediction is sufficiently supported by the information legitimately
> available when it was made — and the freedom to abstain, or to stop, rather than manufacture
> certainty.

This is not a machine-learning standard. A valid model can still produce a poor or unjustified
prediction, and a mediocre model can produce a well-supported abstention. The boundary is documented
in [docs/ml-vs-prediction-boundary.md](docs/ml-vs-prediction-boundary.md) and nothing here evaluates
a model.

The subject of evaluation is a **prediction record**: one prediction, or one abstention, together
with the evidence claimed to support it. Records are JSON, validated against
[schemas/prediction-record.schema.json](schemas/prediction-record.schema.json), and evaluated by the
`predictions` command against a rule catalog and a project policy.

## Adopting these standards

| Question | Answer |
|---|---|
| What is evaluated? | An individual prediction record, not a repository and not a model. |
| What do I write? | A `project-policy.yml` declaring your thresholds, plus a record per prediction. Start from [templates/](templates/). |
| How do I check one? | `npx predictions check path/to/records` — see [INSTRUCTIONS.md](INSTRUCTIONS.md). |
| What does a pass mean? | That every rule which was *evaluated* passed. Rules nothing evaluated are reported as such, never as passes. |
| Can it tell me not to predict? | Yes. A well-formed abstention is `SUPPORTED`, and a manipulated standard produces `BLOCKED_BY_INVARIANT`. |
| Do I copy the standards into my repo? | No. Copy the templates; reference the standards. A copied standard is a second definition that drifts. |

## Verdicts

| Verdict | Meaning |
|---|---|
| `SUPPORTED` | Every applicable evaluated rule passed. A valid abstention reaches this. |
| `SUPPORTED_WITH_EXCEPTIONS` | Passed only by way of an approved, unexpired exception. |
| `INSUFFICIENTLY_SUPPORTED` | An applicable rule failed. The prediction is not justified by its evidence. |
| `BLOCKED_BY_INVARIANT` | A non-exemptible rule failed, or the standards themselves were manipulated. Stop. |
| `NOT_EVALUATED` | No verdict was reached. A configuration fault, never a statement about the prediction. |

## The standards

52 rules across 19 standards. **47 of the 52 rules have a detector**; the remaining five are
human-review rules that no structural check can establish, and they are reported `not-evaluated`
until a human attests to them. 16 of 19 standards are fully machine-represented.

That last figure is a designed boundary rather than a backlog item. Three of the five unevaluated
rules govern reasoning about predictions whose outcomes are known, and the record schema carries no
outcome by design — so a detector for them would be checking something other than the rule. A
truthful `not-evaluated` is worth more than fabricated assurance; see
[CHANGELOG.md](CHANGELOG.md#coverage-at-release--and-why-4650-is-not-a-defect).

**Coverage went down in 1.1.0, and that is the release working.** 1.0.0 evaluated 46 of 50 rules;
1.1.0 evaluates 47 of 52. Standard 19 added a property three adoptions proved real and one adoption
proved unautomatable, so one of its two rules is `manual-review` and reports `not-evaluated` until
attested. A pack that only ever added rules it could check would be selecting its standards by what
is easy to detect.

| # | Standard | Document | Rules | Prohibitions |
|---|---|---|---|---|
| 1 | Probability Definition | [standards/01-probability-definition.md](standards/01-probability-definition.md) | 8 | 3 |
| 2 | Uncertainty | [standards/02-uncertainty.md](standards/02-uncertainty.md) | 2 | — |
| 3 | Calibration | [standards/03-calibration.md](standards/03-calibration.md) | 5 | 5 |
| 4 | Reference/Baseline Probability | [standards/04-baseline-probability.md](standards/04-baseline-probability.md) | 2 | — |
| 5 | Data Freshness | [standards/05-data-freshness.md](standards/05-data-freshness.md) | 2 | 1 |
| 6 | Missing Information | [standards/06-missing-information.md](standards/06-missing-information.md) | 2 | 1 |
| 7 | Sample-Size Sufficiency | [standards/07-sample-size-sufficiency.md](standards/07-sample-size-sufficiency.md) | 2 | — |
| 8 | Outliers | [standards/08-outliers.md](standards/08-outliers.md) | 1 | — |
| 9 | Regime Change | [standards/09-regime-change.md](standards/09-regime-change.md) | 2 | — |
| 10 | Model Disagreement | [standards/10-model-disagreement.md](standards/10-model-disagreement.md) | 1 | 1 |
| 11 | Ensemble Behavior | [standards/11-ensemble-behavior.md](standards/11-ensemble-behavior.md) | 3 | 1 |
| 12 | False Precision | [standards/12-false-precision.md](standards/12-false-precision.md) | 2 | 2 |
| 13 | Prediction Expiration | [standards/13-prediction-expiration.md](standards/13-prediction-expiration.md) | 2 | — |
| 14 | Edge Calculation | [standards/14-edge-calculation.md](standards/14-edge-calculation.md) | 5 | 1 |
| 15 | Vig Removal When Relevant | [standards/15-vig-removal.md](standards/15-vig-removal.md) | 3 | — |
| 16 | Confidence Definitions | [standards/16-confidence-definitions.md](standards/16-confidence-definitions.md) | 4 | 2 |
| 17 | Abstention | [standards/17-abstention.md](standards/17-abstention.md) | 3 | 1 |
| 18 | Standards Integrity | [standards/18-standards-integrity.md](standards/18-standards-integrity.md) | 1 | 1 |
| 19 | Outcome Falsifiability | [standards/19-outcome-falsifiability.md](standards/19-outcome-falsifiability.md) | 2 | — |

Standards 1–17 come from the domain brief's `Required standards` list, in its order. Standard 18
comes from the standards-system specification's integrity invariant.

Standard 19 comes from neither. It is derived from the adoption programme, which produced records
that satisfied every rule above while being incapable of being wrong. The inventory records the
difference explicitly — `origin: "source"` against `origin: "evidence"` — so a requirement learned
from adoption is never presented as one a specification stated
([ADR 0009](artifacts/adr/0009-evidence-derived-standards.md)).

## Prohibitions

19 rules carry `level: forbidden` — 18 from the domain brief's must-never list, plus the integrity
invariant. **Nine are non-exemptible**: no policy may waive them, downgrade them, or declare them
not-applicable, and violating one produces `BLOCKED_BY_INVARIANT` rather than an ordinary failure.

```text
abstention.no-manufactured-prediction    probability.not-expected-value
calibration.no-lookahead-evaluation      probability.not-fabricated
calibration.no-lookahead-generation      confidence.not-fabricated
edge.not-fabricated                      confidence.not-probability
integrity.no-manipulation
```

## Decisions

- [ADR 0001](artifacts/adr/0001-prediction-records-are-the-validation-subject.md) — prediction records are the validation subject
- [ADR 0002](artifacts/adr/0002-verdict-vocabulary.md) — the verdict vocabulary, and why not "compliant"
- [ADR 0003](artifacts/adr/0003-abstention-is-a-positive-outcome.md) — abstention is a positive outcome
- [ADR 0004](artifacts/adr/0004-must-never-rules-are-forbidden-level.md) — must-never rules are forbidden-level, and the non-exemptible set
- [ADR 0005](artifacts/adr/0005-record-level-applicability-and-policy-parameters.md) — record-level applicability and policy parameters
- [ADR 0006](artifacts/adr/0006-standards-integrity-ratchet.md) — the standards-integrity ratchet
- [ADR 0007](artifacts/adr/0007-cli-command-design.md) — the CLI commands, and why audit and check stay separate

## Design documents

- [docs/prediction-model.md](docs/prediction-model.md) — the twelve factors, and probability vs confidence vs edge vs expected value
- [docs/ml-vs-prediction-boundary.md](docs/ml-vs-prediction-boundary.md) — what this pack does and does not evaluate
- [docs/design/concepts.md](docs/design/concepts.md) — which standards-system concepts were adopted, and the reasoning
- [docs/architecture.md](docs/architecture.md) — how the pieces fit together
- [docs/local-ci.md](docs/local-ci.md) — running the full pipeline in Docker, and the verified-PR workflow
- [docs/json-output.md](docs/json-output.md) — the `--json` report a machine consumer integrates against, and what its status does not tell you

## Layout

```text
standards/       18 numbered normative documents
rules/           the rule catalog, one JSON file per category
schemas/         prediction-record, project-policy and report-envelope schemas
scripts/         the CLI, the invariant checks, and the CI harness; ESM, zero dependencies
test/            node --test, with fixture records and known-negative policies
examples/        two records that reach SUPPORTED: one prediction, one abstention
templates/       what an adopting project copies
artifacts/       the source specs, the reviewed inventory, the integrity baseline, the ADRs
project-policy.yml   this repository's own policy — it is its own first adopter
compose.ci.yml       the ephemeral CI environment; Dockerfile.ci pins it by digest
```

## Commands

`audit` surveys, `check` decides, `explain` justifies, `status` summarises, `init` scaffolds. Full
detail in [INSTRUCTIONS.md](INSTRUCTIONS.md).

## CI, and verified pull requests

The complete pipeline runs in Docker, locally, before anything is pushed:

```powershell
.\scripts\ci.ps1
```

and a pull request is opened only for a commit that pipeline has verified:

```powershell
.\scripts\submit-pr.ps1
```

which rejects a dirty tree, records `HEAD`, runs the full pipeline, re-checks `HEAD`, and pushes the
**SHA rather than the branch** — so the commit on the pull request is exactly the commit that
passed. `scripts/ci.sh` and `scripts/submit-pr.sh` are the POSIX equivalents.

The eight stages are `inventory`, `fidelity`, `integrity`, `policy`, `diagrams`, `test`, `audit`,
`check`, in that order: the invariant checks precede the tests because each guards an assumption the
tests rest on, and `check` runs last because it is the only stage that produces a verdict. The list
lives in one place — `ci.stages` in `package.json` — and `npm run ci` executes it. There is no flag
that runs a subset.

`.github/workflows/ci.yml` invokes the same entry point rather than restating the steps, and is the
independent re-run on a clean clone; it is not required to open a pull request. Full detail,
including the isolation model and how to debug a failed container, in
[docs/local-ci.md](docs/local-ci.md).

## Conventions

Standards are `standards/NN-<kebab-title>.md`, numbered from 01 with no gaps. Rule ids are
`category.kebab-case-name`, lower-case throughout — there are no aliases and no second spellings.
Verdicts and statuses are `SCREAMING_SNAKE`; dispositions are `lower-kebab`.

Version 1.0.0 — see [VERSION](VERSION) and [CHANGELOG.md](CHANGELOG.md). Zero third-party
dependencies, and CI has no install step, so adding one breaks the build by design.
