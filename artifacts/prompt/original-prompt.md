Implement a **Prediction Standards** pack.

This pack governs whether an individual prediction is sufficiently supported.

It is separate from Machine Learning Standards. A valid ML model can still produce a poor or unjustified prediction.

Preserve the existing standards architecture.

## Prediction model

Where applicable, evaluate:

* predicted probability
* baseline/reference probability
* uncertainty
* calibration
* sample size
* data completeness
* data freshness
* model agreement/disagreement
* regime/context changes
* market/reference expectations
* edge
* confidence tier

Explicitly distinguish probability, confidence, edge, and expected value.

## Required standards

Cover:

* probability definition
* uncertainty
* calibration
* reference/baseline probability
* data freshness
* missing information
* sample-size sufficiency
* outliers
* regime change
* model disagreement
* ensemble behavior
* false precision
* prediction expiration
* edge calculation
* vig removal when relevant
* confidence definitions
* abstention

## Must-never rules

Never:

* manufacture a prediction when evidence is insufficient
* confuse model confidence with event probability
* confuse probability with expected value
* call a tiny modeled difference meaningful without justification
* ignore missing critical information
* use stale information without accounting for staleness
* silently change prediction methodology
* present excessive decimal precision unsupported by the model
* fabricate probabilities
* fabricate confidence
* fabricate edge
* cherry-pick models because they predict the desired result
* ignore major disagreement among models
* claim calibration that has not been measured
* use post-event information in historical predictions
* evaluate historical prediction quality using information unavailable when predictions were generated
* treat a correct outcome as proof that a prediction process was good
* treat an incorrect outcome as proof that a probabilistic prediction was bad

## Abstention

Make abstention first-class.

Valid prediction outputs must include the possibility:

> NO PREDICTION / INSUFFICIENT EVIDENCE

The system should prefer abstention over unjustified certainty.

## Deliverables

Implement standards, prohibitions, evidence, applicability, verification, tests, documentation, and examples.

Explicitly document the boundary between ML model quality and prediction quality.

Run all validation and report results.
