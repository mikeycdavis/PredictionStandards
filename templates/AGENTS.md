# Agent instructions

Load in this order.

1. **[PROJECT.md](../PROJECT.md)** — what this project is and what it predicts.
2. **[project-policy.yml](../project-policy.yml)** — the thresholds, applicability, exceptions, and
   attestations this project declares. Read `parameters` before reasoning about any threshold.
3. **[INSTRUCTIONS.md](../INSTRUCTIONS.md)** — how to run the checks and what the verdicts mean.
   Section 8 is written for you.

Do not read the standards documents before you need them. Run `predictions explain <record>` and
follow the rule ids it names; each links to the standard that governs it.

## Before emitting a prediction

Run `predictions check <record>`. Do not present a prediction whose record you have not checked.

## The two refusals

You are never required to produce a positive recommendation.

- **Abstain** when the evidence does not support a prediction. Emit an abstention record with the
  statement `NO PREDICTION / INSUFFICIENT EVIDENCE` and at least one coded reason. A well-formed
  abstention is `SUPPORTED` — it does not score worse than a prediction.
- **Stop** on `BLOCKED_BY_INVARIANT`. Report the verdict and the rule. Do not adjust the policy, lower
  a threshold, edit the record's declarations, or re-run with different flags until the verdict
  changes. Doing so is the violation the verdict is naming.

## Never

- Fabricate a probability, a confidence tier, or an edge.
- Present a confidence tier as a probability, or a probability as an expected value.
- Weaken, waive, reclassify, or reinterpret a rule because it blocks a result you want.
