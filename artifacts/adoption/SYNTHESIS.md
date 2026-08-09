# Adoption synthesis — #1 Moneyball, #2 BurnoutPredictor, #3 DeadInternetDetector

**Status: evidence, classified. This document does not declare v1.1 requirements.**

> **Updated after Adoption #3.** Adoption #3 was a focused N1 replication experiment rather than a
> broad audit; its full findings are in [`03-deadinternet.md`](03-deadinternet.md). The
> classification below has been revised in exactly two places, both recorded inline: **N1 moved from
> Class 3 to Class 1** on independent replication, and **R2 gained a third observation**. New
> findings from #3 are marked `[#3]`. Nothing else was rewritten, so the pre-#3 classification
> remains legible.

Three adoptions run against the frozen `release/v1.0.0` baseline, **each branched from
`release/v1.0.0` directly** rather than from its predecessor, so "reproduced across adopters" means
runs that could not have contaminated each other. **No standard, rule, threshold, detector, schema,
or v1.0 artifact was changed in any of them.**

| | Adoption #1 | Adoption #2 | Adoption #3 |
|---|---|---|---|
| Adopter | Moneyball | BurnoutPredictor | DeadInternetDetector |
| Domain | sports betting, real money | personal wellness, no money | webpage authenticity |
| Consequence of a bad prediction | financial loss | a person misjudging their own health | a page mislabelled |
| Market / edge / EV / vig | **central** | **absent entirely** | absent entirely |
| External reference to anchor on | de-vigged closing line | **none** | none |
| Outcome resolvable by | real game results | user check-ins, or nothing at all | **varies by structure — the experiment** |
| Purpose | broad audit | broad audit | **focused N1 replication** |
| Records | 3 | 4 | 6 |
| Verdicts produced | `INSUFFICIENTLY_SUPPORTED`, `SUPPORTED` ×2 | `SUPPORTED` ×3, `BLOCKED_BY_INVARIANT` | `SUPPORTED` ×6 |

The first two were chosen to differ in whether the pack's hardest numerical machinery applies at all.
**It does not, in two thirds of the sample, and the architecture stayed coherent** — every
market/edge/EV rule reported not-applicable, and Adoption #2's honest record reached `SUPPORTED` on
baseline, uncertainty, freshness, completeness, and abstention alone.

The third was not an audit. It was a single-hypothesis replication test, and its six records are five
deliberately chosen structures plus one defeat-the-signal control.

---

## Classification

### Class 1 — Reproduced across adopters

Findings that more than one adoption produced independently. **The strongest evidence available**,
and the only class where a change is clearly justified by more than a single observation.

#### 1A — Reproduced framework defect

| # | Finding | #1 | #2 | #3 |
|---|---|---|---|---|
| **R1** | The ensemble not-applicable reason asserts *"a single method produced the prediction"* — a fact inferred from a missing field and stated as observed. | F2 | G2 | present |
| **N1 → R5** `[#3]` | **A `resolutionSource` may name the predictor's own already-computed output.** A circular, unfalsifiable record reaches `SUPPORTED` at 100%. | — | G1 | S4 |

**On R1.** In Moneyball the claim is unsupported; in BurnoutPredictor it is **flatly contradicted
by the source**, which combines five weighted subscores under a renormalizing average; in
DeadInternetDetector the same weighted-composite shape recurs. The framework is violating its own
`OBSERVED` / `INFERRED` distinction, in the one place a reader is most likely to trust it.

Note the shape carefully: in all three adopters the **disposition is correct** — the rules genuinely
do not apply — and only the **explanation** is wrong. The evidence supports deleting an unsupported
clause. It does not support making the ensemble rules fire.

**On R5.** N1 was promoted from Class 3 on independent replication. Adoption #3 reproduced it in a
structurally unrelated derived-score system — different domain, codebase, and score construction —
so it is no longer a BurnoutPredictor modelling oddity. It is now the **second** finding with
independent confirmation, and the more severe of the two.

Adoption #3 also established what the eventual property is **not**. Its record S5 is resolved by the
same analyzer, running the same methodology on the same upstream pipeline — maximal
non-independence — and is entirely legitimate, because it forecasts a future measurement that making
the prediction does not determine. So:

- **externality** — not required (S5 has none)
- **independent observation** — not required (S5 shares everything)
- **semantic correspondence** — necessary but not sufficient (S4 has it)
- **falsifiability at prediction time** — **this is the property**

A rule requiring independent resolution would reject two legitimate structures. Whatever v1.1 does,
the target is falsifiability, which #3 found to be clearly identifiable and **not obviously
machine-checkable**.

#### 1B — Reproduced adopter patterns

These are not framework defects. They are facts about how prediction systems are actually built,
observed more than once, and they bear on whether particular rules are earning their place.

| # | Pattern | Bearing |
|---|---|---|
| **R2** `[#3]` | **Three of three** projects store confidence **twice**: numeric and categorical. Moneyball `Confidence DECIMAL(5,4)` + `ConfidenceRating`; BurnoutPredictor `confidence Float 0..1` + `confidenceLabel`; DeadInternetDetector `confidence Float?` + `aiConfidence String?`. | Evidence *for* `confidence.not-probability` (non-exemptible). The numeric field is `0..1` in two of the three — visually indistinguishable from a probability. All three already have the categorical field the rule requires, so the rule costs nothing and names which representation is safe to publish. |
| **R3** | **Neither project can abstain.** Both always emit. Moneyball gates *betting* downstream; BurnoutPredictor degrades *confidence*. Different mechanisms, identical gap. | Evidence *for* Standard 17 being the highest-value thing adoption offers. Both have the concept locally — Moneyball's MMA "cannot bet", BurnoutPredictor's per-dimension `score: null` and its "Learning your baseline" UI state — and both lose it at the output. |
| **R4** | Both derive confidence from **evidence**, not from the prediction's extremity. Moneyball's `ConfidenceBreakdown`; BurnoutPredictor's tracked days + completeness + active dimensions + baselines present. | Independent convergence with Standard 16 R3 and R5. BurnoutPredictor's implementation matches R3 more closely than this repository's own example vocabulary. |

---

### Class 2 — Adopter-specific

Exposed by one adopter and **shown not to generalise**, because the other adopters' structures could
not produce them. This is the discrimination the multi-adopter design was built to provide.

| # | Finding | Confined to | Evidence it does not generalise |
|---|---|---|---|
| **A1** | `tolerance` conflates probability-space and currency-space, so an expected value rounded to cents fails permanently (`6.99` vs exact `6.988`). | money-bearing predictions | Neither #2 nor #3 has an expected value; the rule reported not-applicable in both and the defect could not occur. **Failed to reproduce twice.** |
| **A2** | A stated `market.vig.overround` is never verified against the quoted prices. | market-referenced predictions | No market in #2 or #3. |
| **A3** | Moneyball's model-agreement gate uses **std dev < 0.08**; the pack uses **max−min spread > 0.10**. For two models these differ by a factor of two, so transcribing the number loosens the gate ~60%. | ensemble-bearing predictions | Neither #2 nor #3 has a homogeneous ensemble. |

A1 is a genuine unit error and remains real — "adopter-specific" describes its *blast radius*, not
its validity.

---

### Class 3 — Newly exposed

Found once, not yet reproduced. **Needs a second observation before the evidence is comparable to
Class 1**, and the note against each says what would supply it.

| # | Finding | Severity | What would confirm it |
|---|---|---|---|
| ~~N1~~ | **Promoted to Class 1 as R5** by Adoption #3. Left here struck through so the classification's history stays legible: this is what a Class 3 finding looks like immediately before it earns replication. | — | Settled by #3, as anticipated. |
| **N2** | `market.*` absence **must be declared**; `edge.*` and `ev.*` absence may be silently omitted. Same class of concept, two standards of evidence. | Low | Any adopter that omits one and declares the other. |
| **N3** | No vocabulary for **disagreement among heterogeneous components of a composite index**. Standard 10 covers multiple models estimating one quantity; sleep-90 / mood-20 averaging to the middle is the same hiding-a-split failure with no rule reaching it. | Medium — a gap, not a defect | **Partially confirmed by #3**: DeadInternetDetector's five category scores are the same weighted-composite shape. Not independently *exercised*, so not promoted. |
| **N4** `[#3]` | The abstention statement **conflates two different refusals**. A descriptive index with complete evidence must assert the fixed `NO PREDICTION / INSUFFICIENT EVIDENCE`, where the first clause is true and the second is false. | Medium | Any adopter producing a descriptive index alongside predictions. |
| **N5** `[#3]` | Adopters record **method limitations** (`Analysis.limitations`) distinct from data gaps. The pack has only `knownGaps`, so "what this methodology structurally cannot see" has nowhere to go. | Low | Any adopter maintaining a limitations field. |

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

**The frozen-baseline protocol paid for itself.** Three adoptions produced **two independently
reproduced defects** (R1, R5), four single-observation findings, three shown to be adopter-specific,
three boundaries, and four policy/documentation candidates — with **zero changes to v1.0.0**.

Two results depended on having more than one adopter and could not have been obtained otherwise.
A1 would have looked like a general defect from Adoption #1 alone; #2 and #3 both failed to
reproduce it, confining it to the money path. R5 would have looked like a BurnoutPredictor modelling
oddity from #2 alone; #3 established it as a hole in the framework — and, by supplying a legitimate
non-independent structure, ruled out the fix that #2 alone would have suggested.

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

---

## Post-#3 position

**Two findings now carry independent replication: R1 and R5 (formerly N1).** Both are cases of the
framework asserting or accepting something the evidence does not support, and the evidence now
indicates that both corrections are narrower than they first appeared:

- **R1** — stop inferring *"a single method produced the prediction"* from an absent `ensemble`
  block. The disposition is correct in all three adopters; only the sentence is wrong.
- **R5** — the target property is falsifiability at prediction time, **not** independent resolution.
  A rule demanding independence would reject legitimate structures observed in #3.

Everything else remains single-observation or boundary. F1 has now failed to reproduce across two
further adopters and is confined to the money path with reasonable confidence.

**Three deliberately different adopters is the sample this review has.** The next step is the v1.1
evidence review, not a fourth adoption.
