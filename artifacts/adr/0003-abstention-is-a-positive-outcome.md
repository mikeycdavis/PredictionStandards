# 0003 — Abstention is a positive outcome

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

The domain brief requires abstention to be first-class and says the system should prefer it over
unjustified certainty. Preferring it is not something a document can accomplish: if abstaining
produces a worse verdict than predicting, every incentive pushes toward manufacturing a number, and
the preference is decorative.

Three options. Give abstention its **own verdict** (`ABSTAINED`). Score it as a **partial** result.
Or let a well-formed abstention reach the **same verdict** a well-evidenced prediction reaches.

## Decision

A well-formed abstention reaches `SUPPORTED`. Prediction-only rules are reported `not-applicable`
with the reason stated, never as failures and never as silent passes.

## Consequences

- The catalog gains `appliesTo` so rules can declare which output kind they speak about (ADR 0005).
- `abstention.no-manufactured-prediction` becomes enforceable as a non-exemptible rule, because
  there is now somewhere to go when it fires. A prohibition with no available alternative is a
  prohibition that gets violated.
- Rejected: a separate `ABSTAINED` verdict. It reads as a third thing between success and failure,
  and consumers would inevitably rank it below `SUPPORTED` — reintroducing the penalty this decision
  removes.
- The risk is over-abstention, since abstaining now costs nothing. Mitigated by requiring at least
  one coded reason mapping to a specific inadequacy: an unfounded abstention has to write `other` and
  explain itself, which makes it as visible as an unfounded prediction. See Standard 17 R6.
