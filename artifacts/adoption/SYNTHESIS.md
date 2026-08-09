# Adoption synthesis — #1 Moneyball and #2 BurnoutPredictor

**Status: evidence, classified. This document does not declare v1.1 requirements.**

Two adoptions run against the frozen `release/v1.0.0` baseline, independently — Adoption #2 branched
from `release/v1.0.0` rather than from Adoption #1, so "reproduced across adopters" means two runs
that could not have contaminated each other. **No standard, rule, threshold, detector, schema, or
v1.0 artifact was changed in either.**

| | Adoption #1 | Adoption #2 |
|---|---|---|
| Adopter | Moneyball | BurnoutPredictor |
| Domain | sports betting, real money | personal wellness, no money |
| Consequence of a bad prediction | financial loss | a person misjudging their own health |
| Market / edge / EV / vig | **central** | **absent entirely** |
| External reference to anchor on | de-vigged closing line | **none** |
| Outcome resolvable by | real game results | user check-ins, or nothing at all |
| Records | 3 | 4 |
| Verdicts produced | `INSUFFICIENTLY_SUPPORTED`, `SUPPORTED` ×2 | `SUPPORTED` ×3, `BLOCKED_BY_INVARIANT` |

The two were chosen to differ in exactly the dimension that matters: whether the pack's hardest
numerical machinery applies at all. **It does not, in half the sample, and the architecture stayed
coherent** — every market/edge/EV rule reported not-applicable, and Adoption #2's honest record
reached `SUPPORTED` on baseline, uncertainty, freshness, completeness, and abstention alone.

---

## Classification

### Class 1 — Reproduced across adopters

Findings both adoptions produced independently. **The strongest evidence available**, and the only
class where a single fix is clearly justified by more than one observation.

#### 1A — Reproduced framework defect

| # | Finding | #1 | #2 |
|---|---|---|---|
| **R1** | The ensemble not-applicable reason asserts *"a single method produced the prediction"* — a fact inferred from a missing field and stated as observed. | F2 | G2 |

In Moneyball this is unsupported; in BurnoutPredictor it is **flatly contradicted by the source**,
which combines five weighted subscores under a renormalizing average. The framework is violating its
own `OBSERVED` / `INFERRED` distinction, in the one place a reader is most likely to trust it.

Note the shape carefully: in both adopters the **disposition is correct** — the rules genuinely do
not apply — and only the **explanation** is wrong. The evidence supports deleting an unsupported
clause. It does not support making the ensemble rules fire.

#### 1B — Reproduced adopter patterns

These are not framework defects. They are facts about how prediction systems are actually built,
observed twice, and they bear on whether particular rules are earning their place.

| # | Pattern | Bearing |
|---|---|---|
| **R2** | Both projects store confidence **twice**: numeric and categorical. Moneyball `Confidence DECIMAL(5,4)` + `ConfidenceRating`; BurnoutPredictor `confidence Float 0..1` + `confidenceLabel`. | Evidence *for* `confidence.not-probability` (non-exemptible). The numeric field is `0..1` in one case — visually indistinguishable from a probability. Both projects already have the categorical field the rule requires, so the rule costs nothing and names which representation is safe to publish. |
| **R3** | **Neither project can abstain.** Both always emit. Moneyball gates *betting* downstream; BurnoutPredictor degrades *confidence*. Different mechanisms, identical gap. | Evidence *for* Standard 17 being the highest-value thing adoption offers. Both have the concept locally — Moneyball's MMA "cannot bet", BurnoutPredictor's per-dimension `score: null` and its "Learning your baseline" UI state — and both lose it at the output. |
| **R4** | Both derive confidence from **evidence**, not from the prediction's extremity. Moneyball's `ConfidenceBreakdown`; BurnoutPredictor's tracked days + completeness + active dimensions + baselines present. | Independent convergence with Standard 16 R3 and R5. BurnoutPredictor's implementation matches R3 more closely than this repository's own example vocabulary. |

---

### Class 2 — Adopter-specific

Exposed by one adopter and **shown not to generalise**, because the other adopter's structure could
not produce them. This is the discrimination the two-adopter design was built to provide.

| # | Finding | Confined to | Evidence it does not generalise |
|---|---|---|---|
| **A1** | `tolerance` conflates probability-space and currency-space, so an expected value rounded to cents fails permanently (`6.99` vs exact `6.988`). | money-bearing predictions | BurnoutPredictor has no expected value; the rule reported not-applicable and the defect could not occur. |
| **A2** | A stated `market.vig.overround` is never verified against the quoted prices. | market-referenced predictions | No market in #2. |
| **A3** | Moneyball's model-agreement gate uses **std dev < 0.08**; the pack uses **max−min spread > 0.10**. For two models these differ by a factor of two, so transcribing the number loosens the gate ~60%. | ensemble-bearing predictions | BurnoutPredictor has no homogeneous ensemble. |

A1 is a genuine unit error and remains real — "adopter-specific" describes its *blast radius*, not
its validity.

---

### Class 3 — Newly exposed

Found once, not yet reproduced. **Needs a second observation before the evidence is comparable to
Class 1**, and the note against each says what would supply it.

| # | Finding | Severity | What would confirm it |
|---|---|---|---|
| **N1** | **A `resolutionSource` may name the predictor's own output.** Record A defines its outcome circularly, resolves against `RiskAssessment.overallScore`, and reaches `SUPPORTED` at 100%. Standard 1 R1 requires a resolution source; nothing requires it to be independent of the predictor. | **Highest of any finding in either adoption** | Any adopter whose "outcome" is a derived index rather than an event — a credit score, a health index, a risk rating. Common enough that a third adoption would likely settle it. |
| **N2** | `market.*` absence **must be declared**; `edge.*` and `ev.*` absence may be silently omitted. Same class of concept, two standards of evidence. | Low | Any adopter that omits one and declares the other. |
| **N3** | No vocabulary for **disagreement among heterogeneous components of a composite index**. Standard 10 covers multiple models estimating one quantity; sleep-90 / mood-20 averaging to the middle is the same hiding-a-split failure with no rule reaching it. | Medium — a gap, not a defect | Any adopter producing a weighted composite index. |

N1 is the finding most likely to matter and the one most resistant to a naive fix. Requiring
independence is easy to state and hard to check: Adoption #2's honest record (B) resolves against
**user-entered check-ins**, which are internal to the product and genuinely independent of the risk
engine. The distinction is between *the predictor* and *the product*, and it may not be
machine-checkable at all.

---

### Class 4 — Framework boundary

**Not defects, and not a to-do list.** Limits of what a declaration-reading evaluator can establish.
Each was predicted or confirmed rather than discovered by surprise, and treating any of them as a bug
would recreate the false-assurance problem the pack exists to prevent.

| # | Boundary | Established by |
|---|---|---|
| **B1** | **Under-declaration.** A producer that sets its own freshness window, empties `criticalMissing`, and omits an ensemble reaches 100% `SUPPORTED`. *The producer sets the window that judges the producer.* | #1, with a working adversarial instance |
| **B2** | **Mis-typing.** Every field present, internally consistent, completely declared — and the artifact is not a prediction. | #2, record A |
| **B3** | **46/50 coverage.** Three outcome-bias/lookahead-evaluation rules have no artifact to inspect; `integrity.no-manipulation` is partly automated. Neither adoption changed this or found it obstructive. | v1.0.0, reconfirmed twice |

**B1 and B2 are different failures and need different mitigations.** B1 is a *completeness* failure —
facts withheld. B2 is a *validity* failure — nothing withheld, the whole quantity mis-typed. The
mitigations discussed for B1 (provenance reconciliation, independent evidence generation, disclosure
standards) **do not touch B2**, because record A withheld nothing.

Provenance reconciliation would close one B1 evasion — the freshness window, which leaves a
contradiction between two fields already in the record. It would not close B1: an empty
`criticalMissing` and an omitted ensemble have **no independent referent inside the artifact**.

---

### Class 5 — Possible policy or default issue

Resolvable without touching rule identity. Evidence that a **default is arbitrary** or that a
**document is silent**, not that a rule is wrong.

| # | Issue | Evidence | Likely home |
|---|---|---|---|
| **P1** | `minSampleSize: 30` collides with BurnoutPredictor's domain-natural `fullTrackedDays: 28`. A fully-baselined user fails a threshold with no source behind it. | #2 | policy — one line, and the mechanism worked as designed. Direct evidence the default is arbitrary. |
| **P2** | The **disagreement statistic** is fixed by the detector (max−min) and undocumented in the policy schema, so an adopter transcribing their own std-dev threshold silently weakens their gate. | #1 (A3) | schema description |
| **P3** | The pack has **no stated position on decision rules**. Moneyball's `model_prob ≥ 0.75` is a betting policy downstream of support; Std 14 R6 reads as if it criticises it. | #1 | documentation |
| **P4** | `INSUFFICIENTLY_SUPPORTED` is narrower than expected. Insufficiency that is *the reason not to predict* escalates straight to `BLOCKED_BY_INVARIANT` (record C), because `abstention.no-manufactured-prediction` is non-exemptible. Correct by design, undocumented. | #2 | documentation |

---

## What the two adoptions establish about the architecture

Stated plainly, because it is the question the freeze was meant to answer.

**It generalises.** The pack's hardest numerical machinery — edge recomputation, de-vigging, expected
value, market consistency — is *entirely absent* from half the sample, and Adoption #2's honest
record still reached `SUPPORTED` on baseline, uncertainty, freshness, completeness, sample size, and
regime alone. Eleven rules reported not-applicable and the verdict remained meaningful.

**The not-applicable mechanism mostly works, and its one failure is precise.** Adoption #2's record A
could not pass until it *declared* that no market exists, with a reason — absence of a field was not
accepted as absence of the concept, which is the specific behaviour the protocol asked to test. The
`ensemble.*` reason is the exception, and it is a wrong sentence rather than a wrong disposition.

**Abstention works and is reachable.** Adoption #2 produced the full progression — `SUPPORTED` →
`BLOCKED_BY_INVARIANT` → `SUPPORTED` abstention — where the last step changed the **output**, not the
evidence. Nothing was added to the abstention record to make it green; two fields were removed and
the same three declared inadequacies became its reasons. Abstention is not the way to launder a
failing record.

**The frozen-baseline protocol paid for itself.** Two adoptions produced one reproduced defect, three
newly exposed findings, three shown to be adopter-specific, three boundaries, and four
policy/documentation candidates — with **zero changes to v1.0.0**. A1 in particular would have looked
like a general defect from Adoption #1 alone; Adoption #2 is what showed it confined to the money
path.

---

## What this document deliberately does not do

It does not declare v1.1 scope, propose rule text, or rank work. The classification is the
deliverable.

Applying the pack's own reasoning to itself: **R1 is the only finding with independent confirmation
from two structurally unrelated adopters.** Everything in Class 3 rests on a single observation, and
N1 — despite being the most severe thing either adoption found — has been seen exactly once. The
honest position is that one observation is a hypothesis with an instance attached, not a
requirement.

A third adoption in a third shape would most efficiently test N1, which needs an adopter whose
outcome is a derived index rather than an event.
