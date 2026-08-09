Create a standalone standards repository for this domain.

This repository will be independently maintained and must not depend on any of the other standards repositories.

Its purpose is not merely to document best practices. It must provide a structured, auditable, testable system for determining:

1. what should be done,
2. what must be done,
3. what should normally be done,
4. what must never be done,
5. when a standard applies,
6. what evidence demonstrates compliance,
7. how compliance can be verified,
8. when a previous applicability/compliance decision must be revisited.

Use the successful concepts of policy-as-code and evidence-based standards evaluation, but design the repository appropriately for this specific domain.

At minimum, investigate whether the repository needs concepts equivalent to:

* requirement
* prohibition
* recommendation
* decision rule
* applicability
* evidence
* verification
* exceptions
* severity
* invariants
* revisit conditions
* not-applicable
* not-evaluated
* compliant
* non-compliant

Do not blindly implement these concepts merely because they are listed. Determine which are appropriate and document the reasoning.

## Critical design principle

"Must never be done" rules are first-class standards.

They must not be buried in documentation.

Where a behavior would invalidate the work, create a dangerous condition, corrupt evidence, produce misleading conclusions, or bypass the integrity of the standards system, represent it explicitly as a prohibition or invariant.

## Standards integrity invariant

The repository should establish a global rule equivalent to:

> A human or AI must never bypass, weaken, remove, reclassify, reinterpret, falsify evidence for, or manipulate a standard, test, applicability determination, evidence requirement, or verification mechanism solely because it prevents the desired implementation or conclusion.

Determine how this invariant can itself be protected and tested.

## AI usage

Assume this repository will frequently be used by AI coding/research agents.

Design the system so an AI can:

* initialize the standards against a target project
* determine applicable standards
* explain why standards apply
* gather or request evidence
* evaluate compliance
* identify violations
* identify prohibitions
* refuse or stop work that would violate an invariant
* recommend remediation
* update evaluations when relevant project state changes

The AI must be able to conclude:

* compliant
* non-compliant
* not applicable
* insufficient evidence / not evaluated
* blocked by invariant

It must never be forced to produce a positive recommendation.

## CLI

Investigate and design an appropriate CLI.

Potential workflows include concepts such as:

standards init
standards plan
standards check
standards audit
standards explain
standards status

Do not blindly copy these commands. Design the CLI around actual domain workflows.

Where mutations occur, support dry-run behavior where appropriate.

Dry-run and apply must derive from the same underlying plan so that dry-run accurately represents what would happen.

## Repository quality

Treat this standards repository itself as production software.

Require:

* automated tests
* deterministic behavior where appropriate
* documentation
* examples
* schema validation
* backward-compatible evolution where reasonable
* clear failure behavior
* safe defaults
* auditable decisions

Do not weaken tests or standards merely to complete implementation.

Before implementation, produce an architecture and milestone plan.

Then implement incrementally, validating each milestone before proceeding.
