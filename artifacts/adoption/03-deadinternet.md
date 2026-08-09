# Adoption #3 — DeadInternetDetector (N1 replication experiment)

**Not a broad standards audit.** A focused falsification/replication test of N1, the finding from
Adoption #2 that a prediction record can satisfy every structural requirement while being
unfalsifiable because the predictor supplies its own resolution truth.

**Adopter:** `F:\Repos\DeadInternetDetector` — produces an "Internet Authenticity Report" for a
webpage: five category scores combined into a fixed weighted overall score (Human 30%, inverse
AI-Likeness 20%, inverse SEO Spam 20%, inverse Ad Density 10%, Editorial 20%), banded from "Highly
authentic" to "Highly artificial or spam-like".

**Standards version:** 1.0.0 (`release/v1.0.0`, unmodified). Branched from `release/v1.0.0` directly.
DeadInternetDetector's working tree was not touched.

Chosen because the external property it characterises — is this page genuinely human-authored? — is
**real but nearly unobservable**, which is the condition that produces circular resolution. The
project's own README states both halves of the N1 confusion:

> "This tool cannot prove whether content was written by AI. All results are probabilistic estimates
> based on observable signals."

Scores described as "probabilistic estimates", about a property the tool says it cannot establish.

---

## Primary question and answer

> Can a second, structurally different derived-score system produce a `SUPPORTED` prediction by
> treating a non-probabilistic score as a probability and resolving it against a non-independent or
> circular target?

**Yes. N1 is independently reproduced.**

Record **S4** maps `Analysis.overallScore` (0–100) to `output.probability` by dividing by 100,
defines its outcome as "the page's authenticity … converted to a proportion", and names
`Analysis.overallScore for this analysis` as its resolution source. It reaches **`SUPPORTED` (100%)**.

Different domain, different codebase, different score construction, same failure. **N1 moves from
Class 3 (newly exposed) to Class 1 (reproduced across adopters).**

---

## The five-structure experiment

The point was not only to reproduce the failure but to check whether the pack can tell the
illegitimate structure from the legitimate ones.

| # | Structure | Resolution target | Legitimate? | Verdict |
|---|---|---|---|---|
| **S1** | descriptive index only | nothing resolves it | yes, but not a prediction | `SUPPORTED` (as abstention) |
| **S2** | score **mapped/calibrated** to a probability | human panel, blind to the analyzer | **yes** | `SUPPORTED` 100% |
| **S3** | model probability, external event | Google's index, wholly external | **yes** | `SUPPORTED` 100% |
| **S4** | score rescaled, **self-resolved** | the analyzer's own completed output | **no** | `SUPPORTED` 100% |
| **S5** | forecast of a **future** derived score | the same analyzer, same version line | **yes** | `SUPPORTED` 100% |

**The pack cannot distinguish S4 from S2, S3, or S5.** Three of those four *should* be supported, so
the failure is specific and narrow — but S4 is indistinguishable from them on every rule the pack
evaluates.

---

## What property is actually required

The protocol asked this to be discovered rather than presupposed, and the answer is **not
independence**.

**S5 is the decisive case.** It is resolved by *the same analyzer, running the same methodology, on
the same upstream data pipeline* — maximal non-independence, zero externality. It is nonetheless a
completely legitimate forecast: it predicts what the September re-analysis will report about the page
*as it exists then*, and that outcome is not determined by making the prediction.

So the candidate properties fare as follows:

| Candidate property | Verdict | Evidence |
|---|---|---|
| **Externality** — resolver outside the product | **Not required** | S5 is legitimate with zero externality. S2 resolves via an internal review panel. |
| **Independent observation** — resolver shares no data or methodology | **Not required** | S5 shares everything and is legitimate. |
| **Semantic correspondence** — the outcome must be the thing the probability is about | **Necessary, not sufficient** | S4 *has* correspondence: its probability is about its stated outcome. The outcome is simply already known. |
| **Falsifiability at prediction time** — the outcome must be **undetermined when the prediction is made** | **This is the property** | Separates S4 from S2/S3/S5 exactly. |

**S4's defect stated precisely:** the resolution target was already computed, by the same run, before
`generatedAt`. No observation made afterwards can disagree with the prediction, because the
observation *is* the prediction. The record is not wrong; it is incapable of being wrong.

S2 achieves falsifiability through independence (a blind panel), S3 through externality (a Google
query), and S5 through **futurity alone**. Independence and externality are two of several sufficient
routes to falsifiability. Neither is the requirement.

### A candidate signal, and its limit

`subject.resolveBy` behaves as a natural discriminator:

| Record | `resolveBy` |
|---|---|
| S2 | 2026-07-04 — future |
| S3 | 2026-09-19 — future |
| S5 | 2026-09-21 — future |
| **S4** | **absent** |

I did not omit it from S4 to make a point; I omitted it because **there is nothing to wait for**. An
honest author of a circular claim has no date to put there. The field is currently optional and
unchecked.

**But the signal is trivially defeatable.** Adding `resolveBy: 2026-09-01` to S4 — a date that means
nothing, since the outcome was fixed in June — leaves it `SUPPORTED` at 100%. Verified: record
`S4b-circular-fake-resolveby.json`.

So `resolveBy` is a **correlate of falsifiability, not falsifiability itself**. It is worth recording
that requiring it would change the error from a *natural omission* into a *deliberate false
statement* — a real difference in kind, and the mechanism several existing rules already rely on
(the market family requires a declared absence rather than accepting silence). It would not make the
property machine-checkable.

---

## Secondary findings

### H1 — The abstention statement conflates two different refusals

Record **S1** is a descriptive index: complete evidence, all five categories scored, full retrieval,
and *no prediction being attempted*. The pack has no output type for it. The nearest available shape
is an abstention, which reaches `SUPPORTED` — while asserting the fixed statement:

```text
NO PREDICTION / INSUFFICIENT EVIDENCE
```

"NO PREDICTION" is true. "INSUFFICIENT EVIDENCE" is **false** — the evidence is complete and the
index is fully determined. The fixed wording bundles *declining for want of evidence* with *not
making a claim of that kind at all*, and a legitimate adopter is forced to misstate which one applies.

This is newly exposed and is a direct consequence of the derived-score shape. Neither prior adopter
produced a purely descriptive artifact.

### H2 — R2 reproduces a third time

`Analysis` stores **both** `confidence Float?` and `aiConfidence String?`. Moneyball stored
`Confidence DECIMAL(5,4)` + `ConfidenceRating`; BurnoutPredictor stored `confidence Float 0..1` +
`confidenceLabel`.

**Three of three adopters independently built the same dual numeric/categorical representation.** In
all three the categorical field is the one the pack accepts, and in two of three the numeric field is
`0..1` — sitting in the same record as a probability-shaped score.

### H3 — Adopters do declare limitations, and the pack has nowhere to put them

`Analysis.limitations String[]` is a first-class field: the product records what its own analysis
could not establish. This is close in spirit to `data.completeness.knownGaps`, but semantically
different — a *limitation of the method* rather than a *gap in the data*. The pack has no field for
"what this methodology structurally cannot see", and an adopter that maintains one has to fold it
into `knownGaps` or drop it.

Minor, and worth noting only because the adopter built it unprompted.

---

## What this experiment did **not** find

Stated explicitly, because a replication that only confirms is a weak replication.

- **No new failure of the market/edge/EV/vig family.** All reported not-applicable with truthful
  reasons quoting the record's declared absence, as in Adoption #2.
- **F1 (currency tolerance) did not reproduce.** Third adopter, no expected value. Confined to the
  money path across three adopters now.
- **R1 (the false ensemble N/A reason) did not arise.** DeadInternetDetector's five category scores
  are a weighted composite, structurally identical to BurnoutPredictor's — but these records never
  declared an `ensemble` block, so the rules reported not-applicable with the same untrue clause.
  **R1 is present here too**; it is listed as "not newly found" rather than absent.
- **The abstention semantics held again.** S1's abstention scored identically to the supported
  predictions, confirming across three adopters that abstention is not penalised.

---

## Bearing on the v1.1 evidence review

**N1 has crossed the replication bar.** Two structurally unrelated derived-score systems produce an
unfalsifiable `SUPPORTED` record by the same route. It is no longer a BurnoutPredictor modelling
oddity.

**The eventual fix is not "require independent resolution".** That rule would reject S5 and S2, both
legitimate. Whatever v1.1 does, the property it must target is *falsifiability at prediction time*,
and the honest position after this experiment is that the property is **clearly identifiable and not
obviously machine-checkable**.

The options this experiment can distinguish between:

1. **Require `subject.resolveBy`, strictly after `generatedAt`.** Cheap, catches the natural case,
   defeatable by a deliberate false date. Converts omission into misstatement.
2. **A new standard governing outcome falsifiability**, with the rule as `manual-review` and
   attestable — honest about not being machine-checkable, consistent with how the pack already treats
   the outcome-bias rules.
3. **A record-level output type for a descriptive index** (H1), which removes the incentive to
   mis-type an index as a probability in the first place.
4. **Nothing yet**, on the grounds that three adoptions is a small sample and the failure requires an
   adopter to actively mis-type their own quantity.

Options 1 and 2 are complementary rather than alternatives. This report takes no position on which
should ship.

---

## Provenance

Produced against PredictionStandards `999c34d` (`release/v1.0.0`) with **no modification to any
standard, rule, threshold, detector, schema, or v1.0 artifact**. All results reproduce with `--as-of`
pinned:

```bash
predictions check artifacts/adoption/03-records/ \
  --policy=artifacts/adoption/03-project-policy.yml --as-of=2026-06-20T11:00:00Z
```
