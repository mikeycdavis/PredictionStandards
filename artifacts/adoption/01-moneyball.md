# Adoption #1 — Moneyball

**Adopter:** `F:\Repos\Moneyball` — NBA/NFL/NHL/NCAA/soccer prediction platform, 441 commits.
Produces win probabilities, computes edge against de-vigged closing lines, runs ensembles, and gates
real money through Kalshi.
**Standards version:** 1.0.0 (`release/v1.0.0`, unmodified throughout).
**Method:** `init → explain → records → audit → check`, run against a scratch workspace. **Moneyball's
working tree was not touched.**

Chosen because it exercises the market/vig/edge/EV path, which is the hardest part of the pack to
test and the part most likely to expose bad thresholds. It also already has its own five-gate
betting discipline, so this is a comparison against a real incumbent rather than a greenfield fit.

---

## The three-record experiment

| Experiment | Result | What it demonstrates |
|---|---|---|
| Current Moneyball representation | `INSUFFICIENTLY_SUPPORTED` / 76% | Existing production data doesn't express all evidence PredictionStandards expects |
| Modest instrumentation | `SUPPORTED` / 100% | Adoption does not require redesigning Moneyball's prediction system |
| Deliberate under-declaration | `SUPPORTED` / 100% | **Structural compliance can exceed evidential honesty** |

The gap between rows 1 and 2 is adoption cost, and it is low. The gap between rows 2 and 3 is a
boundary of the current architecture, established with a working adversarial instance rather than by
speculation. Row 3 is the most significant artifact this adoption produced.

Records are preserved alongside this report under `records/`:
`as-is-from-moneyball.json`, `achievable-with-instrumentation.json`, `under-declared.json`.

---

## Part 1 — Where Moneyball and the standards independently agree

Seven convergences, arrived at without knowledge of this pack. These matter more than the
disagreements, because they are evidence the standards describe something real rather than something
invented.

| Moneyball | Standard | Note |
|---|---|---|
| Calibration gate **fails closed on NULL**: *"'never measured' must not be the same state as 'measured and fine'"* | `calibration.claim-requires-measurement`; Std 18 R4 | Almost verbatim our `skipped ≠ passed`. Independently derived. |
| *"An unwired gate is indistinguishable from no gate"* | `EVALUATED_RULES`, Std 18 R4 | They shipped two inert gates for months and wrote the lesson down. Same failure our anti-false-green machinery exists to prevent. |
| `starting_goalie_confirmed` returns **`None` = unknown, never `False`** | evidence labels `OBSERVED` / `INFERRED` / `UNKNOWN` | *"'we cannot know' is a different claim from 'we checked and it's unconfirmed'"* |
| Gate 4: model agreement, std dev of per-model probs | Std 10, `ensemble.disagreement-declared` | Their worked example — *0.55 and 0.95 average to 0.75* — is the same one in Std 10's opening. |
| De-vig before comparing to model probability | Std 15 R3/R4, `market.vig-removed` | `devig_implied_prob` is `raw_h / total` — exactly our `proportional` method, so our evaluator recomputes it **exactly**. |
| Edge measured against de-vigged closing line | Std 14 | |
| MMA *"passes its gate and still cannot bet"*, pinned by a test | Std 17 (abstention), Std 18 (ratchet) | A structural refusal that a test prevents from being documented away. |

**This is the strongest validation available**: an independent team building a real money-moving
system converged on the pack's central principle — that "not checked" and "checked and fine" must
never render identically.

---

## Part 2 — Disagreements (adopter vs standard)

### D1 — Numeric confidence collides with a non-exemptible rule

Moneyball stores **both** `Confidence DECIMAL(5,4)` and `ConfidenceRating NVARCHAR(20)`, and betting
gate 2 uses the numeric one (`confidence_score ≥ 75`).

`confidence.not-probability` is **non-exemptible** and rejects numeric tiers. A record built from
`Confidence` would produce `BLOCKED_BY_INVARIANT`; one built from `ConfidenceRating` passes cleanly.

**Verdict: standard holds.** Moneyball already has the categorical field the standard wants; the
adoption path is to map `ConfidenceRating`, not to weaken the rule. This is the standard doing
useful work — it names which of two existing representations is safe to publish.

### D2 — Gate 1 is a decision rule the pack has no opinion on

`model_prob ≥ 0.75` treats probability magnitude as actionability. Std 14 R6 explicitly says a
positive edge is not a decision rule, and Std 16 R5 warns that confidence should not track distance
from 0.5.

**Verdict: out of scope, and the boundary should be stated.** PredictionStandards governs whether a
prediction is *supported*, not whether it is *actionable*. Moneyball's gates are a betting policy
sitting downstream. Nothing in the pack conflicts with gate 1 — but nothing in the pack says so
either, and an adopter could reasonably read Std 14 R6 as criticising their gate. **Candidate v1.1
documentation change, not a rule change.**

### D3 — The disagreement statistic is not the same statistic

| | Moneyball | PredictionStandards |
|---|---|---|
| Statistic | standard deviation of per-model probabilities | max − min spread |
| Threshold | `< 0.08` | `> 0.10` |

For two models these are not comparable: population sd = range ÷ 2, so their 0.08 sd ≈ **0.16 range** —
roughly **60% looser** than our default. An adopter transcribing "0.08" into
`disagreementThreshold` would silently weaken their own gate.

**Verdict: real trap, no rule change needed.** The threshold is policy-level exactly so it can be
set per domain, but the *statistic* is fixed by the detector and undocumented in the policy file.
**Candidate v1.1:** name the statistic in `parameters.disagreementThreshold`'s schema description.

### D4 — Structural gaps in the record

Moneyball's `dbo.Predictions` has no column for, and no pipeline producing:

| Missing | Standard | Cost to add |
|---|---|---|
| uncertainty interval on the main probability | 2 | low — `DistributionJson` already exists for some targets |
| baseline / base-rate probability | 4 | low — home-court base rate is already computed elsewhere |
| `dataAsOf` (data currency, distinct from `CreatedAt`) | 5 | low |
| known gaps / critical missing | 6 | medium — requires a disclosure discipline, not a column |
| sample size, unit, basis | 7 | low |
| outlier assessment | 8 | medium |
| regime assessment | 9 | medium |
| `expiresAt` | 13 | low — arguably their largest real exposure: a prediction generated pregame has no stated shelf life |

**Verdict: adoption cost, not a standards defect.** Eight of ten failures in the as-is run are
"Moneyball does not record this yet", and most are cheap.

### D5 — No abstention, anywhere

This is the deepest structural finding. Moneyball **always** emits a probability; the five gates only
decide whether to *bet*. There is no representation of "no prediction".

`test_no_bet_when_below_prob_threshold` is a **betting** decision, not an abstention. Std 17 R4 draws
exactly this distinction: a hedged prediction that consumers strip the caveats from is not the same
artifact as a refusal.

The MMA case is the proof. The model is *deliberately under-confident*, showed "47% where the market
said 20% — a +27% edge that is pure humility", and is prevented from betting only by a threshold
collision. Under this pack that is a candidate abstention with a stated reason, not a prediction that
happens to be filtered downstream.

**Verdict: standard holds, and this is the most valuable thing adoption would give Moneyball.**

---

## Part 3 — Findings about PredictionStandards v1.0.0

**Nothing was fixed. All of this is evidence for whether v1.1 needs to exist, not a patch release
in disguise.**

Two distinct classes, deliberately kept apart:

- **3A — Observed framework defects.** Specific, reproducible, and fixable. Each is a case where the
  framework does something demonstrably wrong: a false positive, an overclaimed reason, an unchecked
  value. These are candidate v1.1 work.
- **3B — The under-declaration vulnerability.** Not a defect to patch. A boundary of what any
  declaration-reading evaluator can establish. Treating it as a bug list would recreate the
  false-assurance problem the pack exists to prevent.

The distinction matters because 3A and 3B invite different responses, and conflating them would let
a partial mitigation be mistaken for a solution.

---

### Part 3A — Observed framework defects

### F1 — `tolerance` conflates probability-space and currency-space *(false positive, confirmed)*

```
p = 0.7642, stake = 100, payout = 140
exact EV        = 6.988000
Moneyball stores  6.99      (rounded to cents — correct to the penny)
difference        0.002000
tolerance         0.000100   ← FAIL
```

`ev.recomputable` fires on a value that is *correct*. One `tolerance` parameter serves both
`edge.recomputable` (probabilities, where 1e-4 is right) and `ev.recomputable` (currency, where any
cent-rounded value differs by up to 0.005). **Any adopter storing EV in cents fails this rule
permanently.**

This is not adoption inconvenience — it is a unit error in the design. Recorded, not fixed.

### F2 — A not-applicable reason asserts more than the evidence supports

When a record omits `ensemble`, the evaluator reports:

> `n/a  ensemble.disagreement-declared: This record names no ensemble; a single method produced the prediction.`

The clause after the semicolon is **inferred from a missing field and presented as fact**. The record
never claimed it. A two-model ensemble split 0.55/0.95 — the exact case Moneyball's gate 4 exists to
catch — is silently reported as "a single method produced the prediction".

**The framework is violating its own evidence-honesty principle** (Std 18 R4, and the
`OBSERVED`/`INFERRED` distinction). The reason should stop at "this record names no ensemble".

Recorded, not fixed. This is the highest-priority v1.1 candidate on the list.

### F3 — A stated `overround` is never verified

I wrote `overround: 0.0761` where the quoted prices imply `0.0769`, and it passed. The detector
recomputes the overround to decide *whether* de-vigging was required, but never compares it to the
value the record states.

Minor, but it is a number a reader would take as checked.

---

### Part 3B — The under-declaration vulnerability

**This is a boundary, not a defect.** F1–F3 above are things the framework gets wrong. What follows
is something no declaration-reading evaluator can get right, and it should not be filed as a bug.

`records/under-declared.json` reaches **`SUPPORTED` (100%)** while:

| Evasion | Mechanism | Guard defeated |
|---|---|---|
| Data **9.3 days old** | record sets its own `freshnessWindow: P30D` | `data.staleness-accounted` — never trips |
| Material injury unknown | `criticalMissing: []` | `data.missing-critical-blocks` — passes |
| Two models split | `ensemble` block **omitted entirely** | all four ensemble rules → `not-applicable` |
| Outliers never examined | `assessed: true, detected: false` | `data.outliers-handled` — unverifiable |

The honest twin (`achievable-with-instrumentation.json`) sets `freshnessWindow: PT6H` and would have
tripped staleness immediately. **The producer sets the window that judges the producer.**

**This is the hypothesis, confirmed with a working instance.** As predicted, the answer is *not*
another detector of the same kind — every input to these rules is a producer declaration, and a
detector reading declarations cannot catch a producer who under-declares. Mechanisms that would
actually bite, in increasing order of cost:

- **provenance reconciliation** — cross-check declarations against other declarations already in the
  record, rather than taking each at face value
- **independent evidence generation** — have the evaluator query the source, not the claim
- **producer attestation** — make the freshness window a reviewed policy value rather than a
  per-record field the producer sets
- **a completeness-of-disclosure standard** — govern the act of declaring, rather than the declaration

#### One detectable instance is not a solved class

The first mechanism is nearly free *for this specific evasion*: `provenance.dataSources[].asOf` is
already in the record and already contradicts `data.freshness.dataAsOf` in the under-declared
instance. A cross-field consistency check would catch it with no new evidence source, and that is a
legitimate v1.1 candidate.

**It would not solve under-declaration.** It closes one evasion that happens to leave a contradiction
between two fields the producer filled in. It does nothing about:

- the empty `criticalMissing` — a fact the producer knows and simply did not write down, contradicted
  by nothing in the record because nothing else references it;
- the omitted `ensemble` — a second model that ran and was never mentioned, leaving no trace anywhere;
- `outliers.detected: false` — an assertion about an examination that may never have happened.

Those three have **no independent referent inside the artifact**. No amount of internal
reconciliation reaches them, because the record is internally consistent with a world in which the
omitted facts do not exist. Catching them requires evidence the framework does not currently have and
cannot obtain from the record alone.

The honest summary: **provenance reconciliation would narrow the vulnerability; it would not close
it.** Any v1.1 that ships such a check must say so plainly, or the check becomes exactly the kind of
partial assurance reported as complete that Standard 18 R4 forbids.

---

## Recommendation

**Do not change v1.0.0 on the strength of one adoption.** F1 and F2 are real and specific; F3 is
minor; the 3B vulnerability is the expected limit rather than a surprise; D2 and D3 are
documentation gaps. That is a coherent v1.1 agenda and not a reason to unfreeze anything yet.

**Adoption #2 should be structurally different.** This adoption leaned heavily on the market path —
edge, vig, expected value, market-implied probability — which is where the pack's hardest numerical
checks live and where it was always most likely to fit. What it did *not* test is the shape the pack
claims to govern equally: **a probabilistic prediction with no market or betting reference**, where
`baseline`, `uncertainty`, `data.freshness`, `data.completeness`, and `abstention` carry the weight
and `edge` / `expectedValue` / `market` are simply not applicable. That is the case that shows
whether the architecture generalises beyond the domain that inspired it.

**Compare before fixing.** A defect that two structurally different adopters expose independently is
strong evidence for a v1.1 rule or detector change. A mismatch only Moneyball hits probably belongs
in policy, in documentation, or in an adopter integration layer — not in the catalog.

**Adoption cost for Moneyball is low and the value is concrete**: map `ConfidenceRating` rather than
`Confidence`, add `expiresAt`, and gain a first-class way to say what MMA has been saying
structurally all along.

---

## Provenance of this report

Produced against PredictionStandards `999c34d` (`release/v1.0.0`) with **no modification to any
standard, rule, threshold, detector, schema, or v1.0 artifact**. Moneyball's working tree was not
modified. The evaluator ran with `--as-of` pinned, so every result here is reproducible:

```bash
predictions check artifacts/adoption/records/ \
  --policy=artifacts/adoption/project-policy.yml \
  --as-of=2026-06-14T18:30:00Z
```
