# 0004 — Must-never rules are forbidden-level, and the non-exemptible set

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

The domain brief lists eighteen must-never rules; the standards-system specification adds the
integrity invariant and requires that such rules not be, verbatim, "buried in documentation."

The inherited catalog has a `level` enum including `forbidden`, which was present but unused. It also
has `nonExemptible`, used on two rules out of twenty-four.

## Decision

Every prohibition becomes a `level: forbidden` catalog rule, one to one — nineteen in total. Each is
quoted verbatim in the standard that owns it and listed in that standard's `## Prohibitions` section.

Nine are additionally `nonExemptible`:

```text
probability.not-expected-value        probability.not-fabricated
confidence.not-probability            confidence.not-fabricated
edge.not-fabricated                   calibration.no-lookahead-generation
calibration.no-lookahead-evaluation   abstention.no-manufactured-prediction
integrity.no-manipulation
```

## Consequences

- Two tests enforce the mapping in both directions: every prohibition has a forbidden rule, and every
  forbidden rule traces to a source prohibition. Neither list can grow without the other.
- The score denominator counts `forbidden` alongside `required`. Omitting it would make the score
  rise as prohibitions were added.
- Non-exemptibility is closed against three routes, not one: an exception is rejected, a level
  override is rejected, and a not-applicable declaration is rejected. Closing only the exception
  would leave the prohibition enforced against the honest route and open on the quiet ones.
- The nine were chosen as the rules where a waiver would make the prohibition meaningless: the three
  fabrications, the two lookaheads, the two category conflations, the manufactured prediction, and
  the integrity invariant itself. The two outcome-bias rules are *not* non-exemptible — they are
  equally wrong, but nothing automated evaluates them, so the flag would have been symbolic.
