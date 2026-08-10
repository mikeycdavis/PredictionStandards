# Concepts: what this repository adopted, and what it did not

The standards-system specification lists fifteen candidate concepts and is explicit about how to
treat the list, reproduced verbatim from the source:

```text
Do not blindly implement these concepts merely because they are listed. Determine which are appropriate and document the reasoning.
```

This document is that determination. Each concept is either adopted with a named mechanism, adopted
in a modified form, or rejected with a reason.

The summary: **thirteen adopted as listed, two adopted in modified form, none rejected outright** —
but three of the thirteen are carried by mechanisms that differ from the obvious reading, and one
concept (`invariants`) required machinery this architecture did not previously have.

---

## The fifteen concepts

| # | Concept | Verdict | Mechanism |
|---|---|---|---|
| 1 | requirement | adopted | `level: required` in the catalog; `### RN` sections in each standard |
| 2 | prohibition | adopted | `level: forbidden`; 19 rules; a `## Prohibitions` section per standard |
| 3 | recommendation | adopted, used sparingly | `level: recommended`; SHOULD-level requirements |
| 4 | decision rule | adopted, renamed | the detector layer in `scripts/records.mjs` + `EVALUATED_RULES` |
| 5 | applicability | adopted, extended | policy `applicability` **and** per-record `appliesTo` |
| 6 | evidence | adopted | evidence labels on findings; `assurance` + `$assuranceNote` per rule |
| 7 | verification | adopted | `validationType`; the `audit` / `check` / `explain` commands |
| 8 | exceptions | adopted | policy `exceptions`, with expiry; rejected against non-exemptible rules |
| 9 | severity | adopted | `severity: error \| warning \| info`, distinct from `level` |
| 10 | invariants | adopted, new machinery | `nonExemptible` + the integrity ratchet + `BLOCKED_BY_INVARIANT` |
| 11 | revisit conditions | adopted, four mechanisms | `revisitWhen`, attestation digests, exception `expires`, record `expiresAt` |
| 12 | not-applicable | adopted | disposition `not-applicable`, from policy or from the record |
| 13 | not-evaluated | adopted | disposition `not-evaluated`; `skipped ≠ passed` |
| 14 | compliant | adopted, renamed | verdict `SUPPORTED` |
| 15 | non-compliant | adopted, renamed | verdict `INSUFFICIENTLY_SUPPORTED` |

---

## Where the reasoning was not obvious

### `requirement` and `prohibition` are different things, not one thing with a flag

A prohibition is not a requirement phrased negatively. "State a baseline" and "never fabricate a
probability" behave differently: the first is satisfied by doing something and can reasonably be
waived when there is nothing to state; the second is satisfied by *not* doing something and cannot be
partially met.

The catalog keeps them in one field — `level` — with `forbidden` as a distinct value rather than a
`prohibition: true` flag on a requirement. This is because the evaluator's failure logic treats
`required` and `forbidden` identically (both produce a failure rather than a warning), so a separate
axis would have been a distinction the engine never read.

All 19 prohibitions live in `## Prohibitions` sections in their standards, with a verbatim quotation
of the source text at the governing requirement. The standards-system spec is explicit that they must
not be, reproduced verbatim:

```text
buried in documentation
```

A prohibition with no rule id, no severity, and no verdict is documentation. Every one of the
nineteen has all three.

### `recommendation` is adopted but deliberately rare

`level: recommended` exists in the enum and **no rule in this catalog uses it**. That is not an
oversight.

Recommendations appear in the standards as SHOULD-level requirements — [Standard 2](../../standards/02-uncertainty.md)
R3, [Standard 10](../../standards/10-model-disagreement.md) R3, and about twenty others — and
deliberately have no catalog rules behind them. The reason: nearly every SHOULD in this pack is a
judgement (is this interval method appropriate? is this freshness window honest?), and a rule that
can be satisfied by writing any non-empty string into a field would convert an open question into a
green tick.

Each standard's `## Implementation` section says which of its requirements have no rule and why. That
is the honest form of a recommendation here: stated in the normative document, absent from the
machine catalog, and the absence explained.

### `decision rule` became the detector layer

The concept as listed suggests a declarative rule engine — conditions and outcomes expressed as data.
That was rejected. Prediction records require genuine computation to evaluate: recomputing an
overround from decimal odds, comparing a stated edge against a difference, deriving a binomial
standard error to bound decimal precision. Expressing those as data would mean building an expression
language, and the language would become a second place where rule semantics live.

Instead the decision logic is ordinary code in `scripts/records.mjs`, bound to the catalog by
`assertBindings`, which throws if a detector reports a rule id the catalog does not define. The
catalog holds identity and metadata; the code holds computation; neither can invent the other's
content.

`EVALUATED_RULES` is the explicit boundary between them: rules with detectors, and rules without.

### `applicability` needed a second mechanism the source architecture lacked

Policy-level applicability answers "does this rule have a subject in this project?" That was
insufficient here, because the subject of evaluation is an individual record and applicability varies
*per record*: an abstention has no edge to recompute, no expiry to check, and no ensemble to inspect.

Handling that through policy would have been wrong — the project does make edge-bearing predictions,
so declaring the edge rules not-applicable project-wide would waive them for the records that do have
edges.

So the catalog gained `appliesTo: prediction | abstention | any`, and the evaluator emits
`not-applicable` per record with a reason drawn from the record's own declaration (for example, from
`market.declaredAbsent.reason`). This is recorded in ADR 0005.

The two mechanisms never merge. Policy applicability is a claim about the project; record
applicability is a fact about the artifact. And neither can turn a failure into a pass — that is what
`exceptions` are for, and they are a separate mechanism again.

### `invariants` was the concept that required new machinery

This is the only concept the inherited architecture had no real answer for, and it is the one the
standards-system spec presses hardest on: it asks not merely that the integrity invariant exist, but
how it can itself be protected and tested.

Three pieces, described fully in [Standard 18](../../standards/18-standards-integrity.md):

1. **`nonExemptible: true`** on 9 of the 52 rules. An exception against one is rejected rather than
   honoured; a policy override of its level is rejected; a not-applicable declaration against it is
   rejected.
2. **The integrity ratchet** (`scripts/integrity.mjs` + `artifacts/integrity-baseline.json`). Every
   rule's `level`, `nonExemptible`, and `severity` are recorded in a reviewed baseline; any drift
   fails CI. Weakening a rule therefore requires a second, deliberate edit to a file whose only
   purpose is to record protection levels — visible in the diff, and paired with a changelog entry.
3. **`BLOCKED_BY_INVARIANT`**, a verdict outranking `INSUFFICIENTLY_SUPPORTED`, meaning stop rather
   than try harder.

The ratchet does not make weakening impossible. Nothing could: whoever maintains a repository can
edit any file in it. It makes weakening *visible*, which is the achievable goal.

### `revisit conditions` are four mechanisms, not one

The spec asks when a previous applicability or compliance decision must be revisited. There is no
single answer, because there are four different kinds of decision that go stale differently:

| What goes stale | Mechanism | Effect when triggered |
|---|---|---|
| a not-applicable claim | `applicability.revisitWhen` (prose) | human review; nothing automatic |
| a human attestation | `reviewedAgainst.digest` | rule returns to `not-evaluated` |
| an exception | `expires` | becomes a failure |
| a prediction itself | `expiresAt` | prediction stops being usable evidence |

Only two are automatic. `revisitWhen` is prose and cannot be, because the conditions are things like
"if we begin predicting outcomes with no liquid market" — knowable to a person, not to a checker. The
attestation digest is the strongest of the four: it compares a hash of the reviewed paths, so an
attestation silently stops counting the moment what it examined changes.

### `compliant` / `non-compliant` were renamed

The subject here is a prediction, not a project, and "compliant prediction" invites the wrong reading
— that the question is procedural conformance rather than evidential support. The verdicts are
`SUPPORTED`, `SUPPORTED_WITH_EXCEPTIONS`, `INSUFFICIENTLY_SUPPORTED`, `BLOCKED_BY_INVARIANT`, and
`NOT_EVALUATED`. Recorded in ADR 0002.

The mapping to the spec's required AI conclusions:

| Spec conclusion | This pack |
|---|---|
| compliant | `SUPPORTED` |
| non-compliant | `INSUFFICIENTLY_SUPPORTED` |
| not applicable | per-rule disposition `not-applicable`; surfaced by `explain` |
| insufficient evidence / not evaluated | `NOT_EVALUATED`, and per-rule `not-evaluated` |
| blocked by invariant | `BLOCKED_BY_INVARIANT` |

A well-formed abstention reaches `SUPPORTED`. That is deliberate and is
[Standard 17](../../standards/17-abstention.md) R5: if abstaining scored worse than predicting, every
incentive would push toward manufacturing a number.

### `evidence` and `verification` are kept apart

These are easy to merge and must not be. `validationType` says *how* a rule is checked
(`structural`, `document`, `configuration`, `code-analysis`, `manual-review`). `assurance` says *how
much a passing result establishes* (`full`, `partial`, `none`). A rule can be fully automated and
still establish very little — `ensemble.no-cherry-picking` is `structural` and `partial`, because it
sees only the exclusions that were disclosed.

Every `partial` and `none` rule carries a `$assuranceNote` saying in plain words what a pass does not
mean. Findings additionally carry an evidence label — `OBSERVED` for a check resting on a defined
structure, `INFERRED` for one resting on a heuristic — so a heuristic result is never reported as an
observation.

### `severity` is not `level`

`level` is how strongly a rule binds (`required`, `forbidden`, `recommended`, `optional`). `severity`
is how loudly a violation is reported (`error`, `warning`, `info`). Both are in the ratchet's
protected set, because downgrading either weakens a rule: `forbidden`→`recommended` stops it failing,
and `error`→`info` stops anyone noticing.

---

## What was considered and not adopted

- **A separate `prohibition: true` flag.** Rejected: the engine treats `required` and `forbidden`
  identically for failure purposes, so a second axis would have been unread metadata.
- **A declarative rule-expression language.** Rejected under `decision rule` above.
- **Numeric confidence scores.** Rejected — [Standard 16](../../standards/16-confidence-definitions.md)
  R1 requires categorical tiers precisely because a number invites arithmetic against the probability.
- **An outcome field on prediction records.** Rejected. Recording what actually happened would make
  the outcome-bias prohibitions ([Standard 3](../../standards/03-calibration.md) R4, R5) *more*
  tempting rather than less, and calibration measurement belongs in a corpus-level analysis rather
  than in a record describing what was known at prediction time.
- **A `--write` flag on the integrity ratchet.** Rejected: the first response to a red build would be
  to run it.
