# 0006 — The standards-integrity ratchet

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

The standards-system specification states the integrity invariant and then asks the harder question:
how can that invariant itself be protected and tested?

The threat is specific. A rule's strength lives in three fields — `level`, `nonExemptible`,
`severity` — and each is one edit away from vanishing. `forbidden` becomes `recommended`;
`nonExemptible: true` becomes `false`; `error` becomes `info`. The catalog loader objects to none of
them: each produces a perfectly valid rule. The change is invisible precisely because the file that
*defines* the rule is the file that was edited.

## Decision

`artifacts/integrity-baseline.json` records those three fields for every rule.
`scripts/integrity.mjs` compares the live catalog against it and fails CI on any drift — weakening,
removal, or an unrecorded addition. `CHANGELOG.md` must name any rule whose protection changed, which
a test enforces.

The baseline is hand-edited. There is deliberately **no `--write` flag.**

## Consequences

- Weakening a rule now takes three visible acts: the rule edit, the baseline edit, and the changelog
  entry. All three appear in the same diff, and the baseline file's only purpose is to record
  protection levels, so an edit to it cannot be mistaken for routine work.
- This does not make weakening impossible, and nothing could — whoever maintains the repository can
  edit any file in it. It makes weakening **visible**. A change that cannot be made accidentally and
  cannot be made quietly is a change somebody chose, which is what makes it reviewable on its merits.
- A `--write` flag was rejected for the reason it would be used: the first response to a red build
  would be to run it, converting the mechanism into a formality. Same reasoning as the source
  inventory, which is also never regenerated.
- Strengthening is reported too, and passes. It is not a violation to make a rule stricter, but it is
  still a change to the protection surface, and a report that stayed silent about half of what it
  watches would be misleading.
- The ratchet is mutation-tested: each way of weakening a rule is reproduced against an in-memory
  baseline and asserted to trip. A ratchet nobody has watched fail is a ratchet nobody knows works.
