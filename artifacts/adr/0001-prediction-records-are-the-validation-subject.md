# 0001 — Prediction records are the validation subject

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

The domain brief says this pack "governs whether an individual prediction is sufficiently supported."
The architecture it inherits was built to audit a *repository*: its detectors ask whether a project
has ADRs, a manifest, a test surface. Those are questions about a codebase, and none of them is the
question here.

Three subjects were available. A **repository** — does this project document its calibration policy,
its abstention rules? A **model** — is this model well built? A **prediction record** — is this
output justified by the evidence it carries?

## Decision

The subject is an individual prediction record: a JSON document describing one prediction, or one
abstention, together with the evidence claimed to support it.

## Consequences

- The record schema becomes load-bearing. It is where the probability/confidence/edge/expected-value
  separation is enforced structurally rather than by instruction, and where abstention becomes
  representable.
- Roughly half the inherited detector code does not carry over. The CLI skeleton, exit codes,
  finding shape, and the anti-false-green machinery do.
- Applicability gains a second mechanism. A rule's subject can be absent from *this record* — an
  abstention has no edge to recompute — which policy-level applicability cannot express. See
  ADR 0005.
- Some things become uncheckable that a repository audit could have reached. Whether a project has a
  written abstention policy, for instance, is invisible from a record. Those are stated in each
  standard's Implementation section rather than papered over.
- Rejected: the repository subject, because a repository can document exemplary practice and still
  emit a bad prediction, which is the exact gap the brief names. Rejected: the model subject, because
  it belongs to a machine-learning standards pack and merging the two produces a verdict nobody can
  read — a failure would mean either "this model is badly built" or "this output is unjustified".
