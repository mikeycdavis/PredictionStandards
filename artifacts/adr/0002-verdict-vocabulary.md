# 0002 — The verdict vocabulary, and why not "compliant"

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

The inherited engine produces `COMPLIANT`, `COMPLIANT_WITH_EXCEPTIONS`, `NON_COMPLIANT`, and
`NOT_EVALUATED`. The standards-system specification requires that an AI be able to conclude
compliant, non-compliant, not applicable, insufficient evidence, and **blocked by invariant** — five
conclusions where the engine had four statuses.

## Decision

Five verdicts:

```text
SUPPORTED
SUPPORTED_WITH_EXCEPTIONS
INSUFFICIENTLY_SUPPORTED
BLOCKED_BY_INVARIANT
NOT_EVALUATED
```

`BLOCKED_BY_INVARIANT` outranks `INSUFFICIENTLY_SUPPORTED` and is checked first.

## Consequences

- "Compliant prediction" invited the wrong reading — that the question is procedural conformance
  rather than evidential support. A prediction is *supported* or it is not.
- The mechanics are unchanged from the inherited engine. Only the names differ, plus the new fifth
  value; every property that made the original trustworthy is preserved.
- `not applicable` maps to a per-rule disposition rather than a verdict, because a whole record is
  never inapplicable — individual rules are. `explain` surfaces them.
- `insufficient evidence` maps to `NOT_EVALUATED` at the verdict level and to the `not-evaluated`
  disposition at the rule level. The two are different scopes of the same idea.
- A well-formed abstention reaches `SUPPORTED`, not a fifth "abstained" verdict. See ADR 0003.
