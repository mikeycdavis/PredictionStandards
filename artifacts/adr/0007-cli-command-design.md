# 0007 — The CLI commands, and why audit and check stay separate

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

The standards-system specification offers `init plan check audit explain status` as candidate
commands and says explicitly not to copy them blindly — to design around actual domain workflows.

The inherited CLI has `audit`, `validate`, and `init`, and its own history records that `audit` and
`validate` shipped as one command and had to be split at 1.0.0.

## Decision

Five commands: `init`, `audit`, `check`, `explain`, `status`.

| Command | Job | Verdict? |
|---|---|---|
| `init` | scaffold a policy and a template record | no |
| `audit` | what does this record contain, and where does it depart? | **no** |
| `check` | is this prediction sufficiently supported? | **yes** |
| `explain` | why did each rule apply, and what was found? | no |
| `status` | aggregate posture of a directory | no |

## Consequences

- `validate` was renamed `check` to match the domain workflow: the question is whether a prediction
  is supported, not whether a document is well-formed.
- `plan` was dropped. It exists in the candidate list for tools with multi-step mutations to preview;
  here the only mutating command is `init`, and its `--dry-run` derives from the same plan object the
  apply path executes, so a separate command would preview nothing extra.
- `explain` was added, and is the command the standards-system specification implicitly requires: an
  AI must be able to determine what applies and explain *why*. It prints every rule as applicable,
  not-applicable with its reason, attested, or not-evaluated.
- `audit` and `check` keep different exit contracts and **no flag moves one into the other.**
  `--strict` is rejected on `check` at argument-parse time, because a flag that changes what a
  verdict means is a trap.
- `audit` reads the policy's `parameters` and nothing else. It needs the thresholds to observe
  anything — without the confidence vocabulary it would report every record as having an undefined
  tier, which is a fact about the missing policy rather than about the record. It still reads no
  applicability, no exceptions, no attestations, and still reaches no verdict.
- `--as-of` is global, because determinism is a property of evaluation rather than of one command.
