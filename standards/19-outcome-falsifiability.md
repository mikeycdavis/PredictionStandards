# Standard 19 — Outcome Falsifiability

A prediction that cannot be wrong is not a prediction. If the value that will settle the outcome was
already fixed when the record was written, no later observation can disagree with it, and every other
standard in this series can be satisfied while the number means nothing.

Source: none. This standard is derived from adoption evidence rather than from a specification — see
[Provenance](#provenance) below and
[ADR 0009](../artifacts/adr/0009-evidence-derived-standards.md).

## Scope

Applies to predictions. An abstention makes no claim that could have been false, so both rules
declare `appliesTo: prediction` and are reported not-applicable on an abstention record, with the
reason stated.

Applies from record schema **1.1.0**. A record declaring an earlier version has no field to carry the
declaration; its disposition is `not-evaluated`, never `passed`
([ADR 0008](../artifacts/adr/0008-record-schema-evolution-and-the-legacy-disposition.md)). See R4.

## Requirements

### R1 — The outcome MUST have been undetermined when the prediction was generated

The outcome named in `subject.outcomeDefinition` MUST NOT have been determined, at `generatedAt`, by
the act or state that produced the prediction
([`falsifiability.resolution-not-self-determined`](../rules/falsifiability.json)).

This is the substance of the standard, and the rest of it is machinery for holding producers to it.
The test is not who resolves the outcome, or where they sit, or what they know. It is whether an
observation made after `generatedAt` could still have contradicted the number. If the resolution
source can only ever report what the record already reported, the record is a restatement wearing a
probability's clothes.

The rule is `manual-review`. Nothing in the artifact distinguishes a resolution source that will
answer later from one that has already answered — both are strings the producer wrote — so this
requirement is established by a human review recorded as an attestation, or it is not established at
all. R5 says what follows from that.

### R2 — Every prediction MUST declare that its outcome was open, and say why

A prediction record MUST carry `subject.falsifiability`, declaring
`undeterminedAtGeneration: true` together with a `basis`
([`falsifiability.declared`](../rules/falsifiability.json)).

The basis states what still had to happen before the resolution source could answer. "The match has
not been played." "The September re-analysis has not been run." "The panel has not reviewed these
pages." It is prose, and a reviewer must be able to disagree with it — a basis that could be written
about any record at all is not a basis.

Declaring `undeterminedAtGeneration: false` is a legitimate thing to do and fails this rule rather
than the schema. An artifact whose outcome was already determined is a measurement or an index, and
saying so plainly is better than the alternatives: mislabelling it as a prediction, or leaving the
question unanswered.

### R3 — Independence and externality MUST NOT be required in place of falsifiability

A record MUST NOT be judged unsupported under this standard on the grounds that its resolution source
shares a method, a data pipeline, an organisation, or a codebase with the predictor.

This requirement is unusual — it constrains the standard rather than the producer — and it exists
because the evidence that produced this standard also ruled out the correction everyone reaches for
first. Independence is one route to falsifiability. So is externality. Neither is the property, and
demanding either rejects legitimate predictions:

- a score calibrated against a **later human review** is falsifiable through the review's timing, and
  the reviewers may be employees;
- a forecast of **what the same system will measure next month** is falsifiable through futurity
  alone, and shares everything else with the predictor.

Both were observed. See [Provenance](#provenance).

### R4 — A record that cannot carry the declaration MUST be reported as not evaluated

For a record declaring a schema version below 1.1.0, `falsifiability.declared` MUST report
`not-evaluated` with a reason naming the version. It MUST NOT report `passed`, and it MUST NOT report
`not-applicable`.

The three dispositions make different claims and only one of them is true here. *Passed* says the
requirement was met. *Not applicable* says the rule has no subject in this record — but every
prediction has an outcome that was either open or closed, so the subject exists. *Not evaluated* says
the rule has a subject and this run could not reach it, which is exactly the situation.

The consequence is that an existing corpus keeps its verdicts and loses coverage, and that is the
correct trade. A compatibility decision must not be able to credit a thousand old records with
satisfying a requirement nothing examined.

### R5 — This pack MUST NOT claim to have established falsifiability

The rules here establish that a declaration was **made**, with a basis, by a producer who is
accountable for it. They do not establish that it is **true**, and no document, message, assurance
note, or release note may say otherwise.

The value of R2 is not detection. It is that it converts a silent omission into a written falsehood.
A producer whose record is circular has, before this standard, simply left a field unset — there was
nothing to wait for, so nothing was written. After it, the same producer must either decline to make
the declaration, or state something untrue about their own artifact, which is a different act and one
the integrity invariant reaches. That is a real gain and a small one, and overstating it would
reproduce the defect this release also fixes in R1: asserting a fact that was inferred rather than
observed.

## Prohibitions

None of the sources' must-never rules attach to this standard, and this standard adds none. Every
`forbidden`-level rule in this pack maps one-to-one to a prohibition a source actually stated, and
that mapping is enforced in both directions. A standard derived from evidence does not get to
manufacture a must-never that no specification wrote, however well-evidenced it is. Both rules here
are `required`.

The closest existing prohibition is `fabricate a probability without a stated basis`
([Standard 1](01-probability-definition.md)). A circular record is a different failure: its basis is
real, its arithmetic is honest, and the number is derived exactly as claimed. What is missing is a
future that could disagree with it.

## Additions this standard makes beyond the source

All of it. No source specification states this requirement, in any form.

The domain brief's `subject` machinery comes close — the record schema has always said the subject
block "is what makes the number falsifiable" — but nothing required the property, and Adoptions #2
and #3 both produced records that satisfied every rule in the pack while lacking it.

R3 is an addition of a kind this series has not needed before: a constraint on how the standard
itself may be enforced, written to prevent a later reader from "simplifying" it into an independence
requirement. The five structures in the [Provenance](#provenance) section are kept as regression
fixtures for the same reason.

## Relationship to other standards

[Standard 1](01-probability-definition.md) supplies `subject`. It requires the event, the outcome
definition, and the resolution source to be stated; this standard requires the outcome to have been
open. A record can satisfy Standard 1 completely and fail this one, which is what made the failure
possible for three adoptions.

[Standard 13](13-prediction-expiration.md) R5 already separates `expiresAt` from `subject.resolveBy`.
This standard adds a third instant to keep distinct: the moment the outcome *became* determined.
`resolveBy` says when the answer is expected; falsifiability is about whether the answer was already
in hand at `generatedAt`. A future `resolveBy` is a correlate and not a proof — Adoption #3 defeated
it with a single fabricated date.

[Standard 17](17-abstention.md) is where a producer goes when this standard cannot be met. If the
outcome was already determined, the honest outputs are an abstention or an artifact that is not a
prediction record at all — not a prediction with a softer confidence tier.

[Standard 18](18-standards-integrity.md) covers two evasions of this one: declaring
`undeterminedAtGeneration: true` about an outcome known to be settled, and holding records at an
older schema version so the rule stays permanently unevaluated. Both are bypassing a standard because
it prevents a desired conclusion. The second is not detectable — the evaluator cannot tell an old
record from a new one wearing an old version — but it is not free either: every such record reports
`not-evaluated` and lowers the corpus's coverage, so a project taking that route advertises it.

## Provenance

This is the first standard in the series derived from adoption evidence rather than from a
specification, and the evidence is recorded so it can be argued with.

**Adoption #2** (BurnoutPredictor) produced record G1: a burnout risk score resolved against the
product's own computed state. **Adoption #3** (DeadInternetDetector) reproduced it independently, in a
different domain and codebase, as record S4 — an authenticity score divided by 100 and resolved
against `Analysis.overallScore for this analysis`. Both reached `SUPPORTED` at 100%.

Adoption #3 then built five structures to find out what property was actually required, and the
answer was not the expected one. These are kept as permanent regression fixtures in
`test/fixtures/records/falsifiability/`:

| | Structure | Resolved by | Required disposition |
|---|---|---|---|
| **S1** | descriptive index, no prediction attempted | nothing | not a prediction; the rules do not reach it |
| **S2** | score calibrated to a probability | a human panel, blind to the analyzer | **permitted** |
| **S3** | model probability about an external event | an external index | **permitted** |
| **S4** | completed score rescaled and resolved against itself | its own already-computed output | **rejected** |
| **S5** | forecast of a future derived score | the same analyzer, same methodology | **permitted** |

S5 is the case that decides the shape of this standard. It is resolved by the same system running the
same method on the same data — maximal non-independence, zero externality — and it is entirely
legitimate, because it forecasts a measurement that making the prediction does not determine.

Any future change to this standard that alters one of those five dispositions has to explain why. The
fixtures are not illustrations; they are the constraint.

Full reasoning, including the corrections that were rejected and what refuted them:
[`artifacts/release-review/v1.1-evidence-review.md`](../artifacts/release-review/v1.1-evidence-review.md),
finding R5 and candidate C2.

## Implementation

Two rules in [`rules/falsifiability.json`](../rules/falsifiability.json), split along the assurance
boundary the evidence established:

- `falsifiability.declared` — structural, `partial` assurance, evaluated by `scripts/records.mjs`
  (D22). Establishes that the declaration was made and that the producer did not declare the outcome
  closed. Gated on record schema 1.1.0 by `atLeastRecordSchema`, with the legacy disposition supplied
  by `recordNotEvaluated`.
- `falsifiability.resolution-not-self-determined` — `manual-review`, `none` assurance, attestable.
  No detector implements R1 and none is planned. It reports `not-evaluated` until an attestation
  records that a human looked.

This standard therefore **lowers** the pack's framework coverage: 47 of 52 rules have a detector,
where 1.0.0 had 46 of 50. That is not a regression. It is what it looks like when a standards pack
learns about a property it cannot honestly automate, and a truthful `not-evaluated` is worth more
than a detector that would have to guess.
