# What `project-policy.yml`'s `standardVersion` means, and this repository's re-adoption

- **Determined:** 2026-08-25, during 1.2.0 release preparation
- **Disposes of:** §5.2 of the
  [release candidate review](./2026-08-23-release-candidate-review.md) — `project-policy.yml`
  declares `standardVersion: "1.0.0"` while the pack is at `1.1.0`
- **Decision:** the field means **"the framework version these predictions are evaluated against"**,
  it is **currently false in this repository**, and this repository **re-adopts at 1.2.0** as a
  deliberate act recorded here

The meaning was measured from the schema, the code, the fixtures and the history before anything was
touched. It was not inferred from the field's name.

## What the repository actually says the field means

**The schema is the only definition that exists.** `schemas/project-policy.schema.json`:

> The framework version this project's predictions are evaluated against. An unresolvable version is
> a configuration error, not a compliance failure.

It is `required`, and constrained to three-part semver.

**No ADR governs it.** Eleven ADRs; none covers adoption or policy versioning. ADR 0008 governs the
*record* schema version, which is a different stream and is explicitly not this one.

**No document elaborates it.** `README.md`, `docs/`, `CHANGELOG.md` and the templates say nothing
beyond the schema sentence.

So the documented meaning is the second of the two readings put to this review: **the version
governing this project right now**, not the version it was last reviewed under. That reading is what
the words say, and there is no competing statement anywhere in the tree.

## What the code does with it: nothing

- `predictions.mjs:206` passes `policy?.standardVersion ?? null` into `envelope()`.
- `compliance.mjs:585` writes it into every per-record envelope.
- Nothing else reads it. No rule binds to it, no check compares it to `VERSION`, and no evaluator
  behaviour changes with it.

The schema's clause about an *unresolvable* version therefore describes behaviour that does not
exist: nothing resolves it, so nothing can find it unresolvable. **The field is declarative and
unverified.** That is why it could sit at `1.0.0` through a full, heavily-reviewed 1.1.0 release
cycle — which moved `VERSION`, `package.json` and `artifacts/integrity-baseline.json.standardVersion`
and left this one — without any gate noticing.

## The field is false today, and this is measurable

Under the documented meaning, this repository's own policy misdescribes its own runs. Measured, not
argued:

```
predictions check examples/records --json
  envelope standardVersion  : 1.0.0
  rules evaluated in the run: 52
  including                 : falsifiability.declared                       introducedIn 1.1.0
                              falsifiability.resolution-not-self-determined introducedIn 1.1.0
```

The predictions were evaluated against the 1.1.0 framework — the two rules Standard 19 added are in
the run and in the report — and the report says they were evaluated against 1.0.0. Both report
`skipped`, which is the correct legacy disposition for a record declaring record schema 1.0.0
(ADR 0008), and that is a *different* stream: the rules were present, applied to, and accounted for
in this evaluation. They did not exist in the framework the policy names.

So this is not a historically stale value that happens to be harmless. Under the only meaning the
repository has written down, it is **currently inaccurate**, and it is inaccurate in the pack's own
published output — the one place this project cannot afford a field that says something untrue about
what was evaluated.

## The other reading, and why it is not this field

The alternative — *"the version under which this project was last deliberately adopted or
reviewed"* — is a coherent and useful thing to record, and this repository does record it, in a
different place:

- `artifacts/integrity-baseline.json` carries both `standardVersion` and `reviewedOn`. That file is
  explicitly a **reviewed** baseline, and its version is bound to `VERSION` by test.
- `artifacts/adoption/*-project-policy.yml` — the three adoption policies — all declare `1.0.0`.
  Those are **frozen historical records** of runs made against the frozen 1.0.0 baseline, exactly as
  the 1.1.0 release notes describe. Their `1.0.0` is correct and permanent.

**Those three files are not touched by this determination, now or later.** They are evidence of what
was evaluated on a particular day; rewriting them to a current version would destroy the record they
exist to keep. If a future cycle wants a live policy to carry *both* "what governs now" and "when it
was last reviewed", that is a second field, not a reinterpretation of this one.

## Decision

**D1 — The documented meaning stands: `standardVersion` names the framework version the project's
predictions are evaluated against.** It is not an adoption date, not a pin, and not a floor. Nothing
in the tree supports a different reading, and inventing one to make the current value defensible
would be fitting the definition to the defect.

**D2 — This repository re-adopts at 1.2.0, as a deliberate act, recorded here.** Under D1 the value
must name the framework the runs are actually made against, and after the 1.2.0 release that is
1.2.0.

The re-adoption is not a leap. What it adopts is already continuously demonstrated: `check
examples/records` runs against this exact catalog on every host and container CI run and has been
green throughout, and the 1.2.0 catalog is **byte-identical** to 1.1.0's — 19 standards, 52 rules, no
protection attribute moved. The governance act is recording something the pipeline has been proving
all along, not asserting something new.

**D3 — It goes to 1.2.0, not to 1.1.0.** This repository was never re-adopted at 1.1.0; the value
was simply left behind. Writing `1.1.0` now would assert a review on a date when none happened, and
would still be wrong the moment 1.2.0 ships. The gap between 1.0.0 and 1.2.0 is real history and this
document is where it is recorded, rather than smoothed over by a backdated value.

**D4 — `templates/project-policy.yml` moves to `1.2.0` in the same act.** A project copying the
template is adopting the pack *now*, and shipping a template that declares a two-releases-old
framework hands every new adopter the same false field on their first run. Under D1 the template's
value is wrong for its reader the day it is copied.

**D5 — This is not part of the mechanical identity bump.** `VERSION`, `package.json.version` and
`artifacts/integrity-baseline.json.standardVersion` are bound to each other by test and move together
because they name the artifact. `project-policy.yml` is this repository *acting as an adopter*, and
an adopter's version moves when the adopter decides it does. The two are separated in the commit
history for that reason: a self-releasing pack that bumps its own adoption automatically has stopped
being an adopter and become a reflection.

## What is deliberately not decided

**The field remains unverified, and that is a candidate, not a fix.** Nothing compares
`policy.standardVersion` to the catalog it is evaluated against, which is precisely why it went two
releases without anyone noticing. A check would make the schema's "unresolvable version is a
configuration error" clause true for the first time.

It is **not built here**, for the reason this repository keeps giving: designing how a policy's
declared framework version is resolved and enforced — across adopters that legitimately pin an older
version, and adoption artifacts that must stay frozen — is a cycle of its own. Doing it inside a
release-preparation step would be exactly the widening that narrow cycles exist to prevent. It earns
entry on its own evidence, and this document is the evidence it will start from.

The held items are untouched: the CI-teardown ownership candidate, the non-squash merge-topology
convention, the withheld retroactive `v1.0.0` tag, and the stale-digest falsy read at
`compliance.mjs:459`. Adjacency is still not evidence.
