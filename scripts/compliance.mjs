/**
 * The evaluation engine: catalog + policy + observed findings → a verdict about one prediction.
 *
 *   observed finding + applicability + exceptions + attestations + assurance
 *       → SUPPORTED | SUPPORTED_WITH_EXCEPTIONS | INSUFFICIENTLY_SUPPORTED
 *         | BLOCKED_BY_INVARIANT | NOT_EVALUATED
 *
 * Four properties are load-bearing:
 *
 *   1. Status is computed from rules, never from the score. There is no threshold at which a
 *      percentage grants or withdraws support.
 *   2. A rule nothing evaluated is `skipped`, never `passed`. Unknown is not a pass
 *      (Standard 18 R4).
 *   3. The score's denominator is the rules that were actually evaluated, and the assurance
 *      breakdown ships beside it so the number cannot imply coverage it does not have.
 *   4. A failing non-exemptible rule, or a detected attempt to waive one, produces
 *      BLOCKED_BY_INVARIANT rather than an ordinary failure. That verdict means stop, not try
 *      harder (Standard 18 R5).
 *
 * THE VERDICT NAMES. The subject here is a prediction, not a project, so "compliant" would invite
 * the wrong reading — that the question is procedural conformance rather than evidential support.
 * A well-formed abstention reaches SUPPORTED, which is Standard 17 R5: if abstaining scored worse
 * than predicting, every incentive would push toward manufacturing a number. See ADR 0002.
 */

import { resolve } from "./catalog.mjs";

export const STATUS = {
  SUPPORTED: "SUPPORTED",
  SUPPORTED_WITH_EXCEPTIONS: "SUPPORTED_WITH_EXCEPTIONS",
  INSUFFICIENTLY_SUPPORTED: "INSUFFICIENTLY_SUPPORTED",
  BLOCKED_BY_INVARIANT: "BLOCKED_BY_INVARIANT",
  NOT_EVALUATED: "NOT_EVALUATED",
};

/** The rule that carries the standards-integrity invariant. Detected manipulations report against it. */
export const INTEGRITY_RULE = "integrity.no-manipulation";

const RESULT = { passed: "passed", failed: "failed", warning: "warning", skipped: "skipped" };

/**
 * @param catalog   from loadCatalog()
 * @param policy    a validated project-policy document, or null when the project declares none
 * @param findings  evaluator findings, each optionally carrying `rule` (a canonical id)
 * @param evaluated the set of rule ids the evaluator actually examined — the crucial input.
 *                  A rule absent from this set was not checked, and reporting it as passing
 *                  because nothing failed is the false green this whole framework exists to stop.
 * @param today     ISO date, for exception expiry
 * @param recordApplicability
 *                  Map<ruleId, reason> for rules whose subject is absent from THIS record — an
 *                  abstention has no edge to recompute, a single-model prediction has no ensemble.
 *                  Distinct from policy applicability, which is a claim about the project rather
 *                  than a fact about the artifact (ADR 0005). Like policy applicability it can only
 *                  remove a rule from consideration; it can never turn a failure into a pass, since
 *                  it is consulted before any finding is read and a rule with findings is never
 *                  inapplicable.
 * @param recordNotEvaluated
 *                  Map<ruleId, reason> for rules this record's own format prevents the run from
 *                  reaching — a record declaring an older schema version cannot carry a field a
 *                  later rule reads. Reported as not-evaluated, never as passed or not-applicable:
 *                  the rule has a subject here, the evaluation simply could not get to it (ADR
 *                  0008). Like the two applicability inputs it cannot suppress a finding.
 */
export function evaluate({
  catalog,
  policy,
  findings,
  evaluated,
  today,
  digests,
  recordApplicability,
  recordNotEvaluated,
}) {
  const declaredRules = policy?.rules ?? {};
  const applicability = policy?.applicability ?? {};
  const recordNotApplicable = recordApplicability ?? new Map();
  const recordUnreachable = recordNotEvaluated ?? new Map();
  const exceptions = Array.isArray(policy?.exceptions) ? policy.exceptions : [];
  const attestations = policy?.attestations ?? {};
  const examined = new Set(evaluated ?? []);
  const currentDigests = digests ?? new Map();

  const byRule = new Map();
  for (const finding of findings) {
    if (!finding.rule) continue;
    const rule = resolve(catalog, finding.rule);
    if (!rule) continue;
    if (!byRule.has(rule.id)) byRule.set(rule.id, []);
    byRule.get(rule.id).push(finding);
  }

  const activeExceptions = new Map();
  const expiredExceptions = [];
  const rejectedExceptions = [];
  for (const entry of exceptions) {
    const rule = resolve(catalog, entry.rule);
    if (!rule) continue;
    // A non-exemptible rule admits no exception. The waiver is REJECTED, not honoured and not
    // quietly ignored: an exception engine that can waive a rule declared non-exemptible has made
    // the prohibition optional, which is not a prohibition. Order matters — this is checked before
    // expiry, because a non-exemptible waiver is invalid whether or not it has lapsed.
    if (rule.nonExemptible) {
      rejectedExceptions.push({ ...entry, rule: rule.id });
      continue;
    }
    if (entry.expires && entry.expires < today) expiredExceptions.push({ ...entry, rule: rule.id });
    else activeExceptions.set(rule.id, entry);
  }

  /**
   * Policy routes that would weaken a non-exemptible rule without filing an exception.
   *
   * These are Standard 18 R2's "weaken" and "reclassify" manipulations. Both look like ordinary
   * configuration — a level in a rules map, a not-applicable declaration with a plausible reason —
   * and both achieve exactly what a rejected exception would have. Catching only the exception
   * would leave the prohibition enforced against the honest route and open on the quiet ones.
   *
   * scripts/policy.mjs reports these too, so an adopter sees them before running an evaluation.
   * They are detected again here because a check that can be skipped by not running one command is
   * not a check.
   */
  const invariantManipulations = [];
  for (const [id, setting] of Object.entries(declaredRules)) {
    const rule = resolve(catalog, id);
    if (rule?.nonExemptible && setting?.level && setting.level !== rule.level) {
      invariantManipulations.push({
        rule: rule.id,
        kind: "level-override",
        message: `${rule.id} is non-exemptible at level '${rule.level}'; the policy sets '${setting.level}'.`,
        remediation: "Remove the override. A non-exemptible rule is enforced at its catalog level everywhere.",
      });
    }
  }
  for (const [id, decl] of Object.entries(applicability)) {
    const rule = resolve(catalog, id);
    if (rule?.nonExemptible && decl?.status === "not-applicable") {
      invariantManipulations.push({
        rule: rule.id,
        kind: "not-applicable-declaration",
        message: `${rule.id} is non-exemptible and cannot be declared not-applicable.`,
        remediation:
          "Remove the declaration. These rules have a subject in every record; the claim they do not is not available.",
      });
    }
  }
  const manipulatedRules = new Set(invariantManipulations.map((m) => m.rule));

  const results = [];
  for (const rule of catalog.rules.values()) {
    const declared = declaredRules[rule.id];
    // A non-exemptible rule is always evaluated at its catalog level. The policy's override is
    // reported as a manipulation below rather than obeyed here; obeying it and reporting it would
    // let the finding and the verdict disagree.
    const level = rule.nonExemptible ? rule.level : declared?.level ?? rule.level;
    const applies = applicability[rule.id];

    // The record itself says this rule has no subject: an abstention carries no edge, a
    // single-model prediction carries no ensemble. Checked before policy applicability because it
    // is a fact about the artifact rather than a claim about the project, and it carries the
    // record's own words as its reason (ADR 0005).
    // A rule with a finding against it is one whose subject demonstrably exists, so no
    // applicability claim can excuse it. This makes the ordering safe rather than merely
    // conventional: applicability is consulted first for readability, and cannot suppress evidence.
    const hasFindings = (byRule.get(rule.id) ?? []).length > 0;

    const recordReason = recordNotApplicable.get(rule.id);
    if (recordReason && !hasFindings) {
      results.push(base(rule, level, RESULT.skipped, "not-applicable", recordReason));
      continue;
    }

    // The record's format puts this rule out of reach of this run — an older record schema version
    // has no field for a later rule to read. Not the same claim as not-applicable, and emphatically
    // not a pass: `skipped != passed` is what keeps a compatibility gap from being credited as
    // support for a property nothing examined (ADR 0008). Guarded by hasFindings for the same
    // reason as above, so it can never suppress evidence.
    const unreachableReason = recordUnreachable.get(rule.id);
    if (unreachableReason && !hasFindings) {
      results.push(base(rule, level, RESULT.skipped, "not-evaluated", unreachableReason));
      continue;
    }

    // Not applicable: the rule's subject does not exist in this project. Visible, never a silent
    // exclusion — never available for a non-exemptible rule, which is caught above, and never
    // able to suppress a finding, for the reason given just above.
    if (applies?.status === "not-applicable" && !manipulatedRules.has(rule.id) && !hasFindings) {
      results.push(base(rule, level, RESULT.skipped, "not-applicable", applies.reason));
      continue;
    }

    // A recorded human judgement (ADR 0005). Checked BEFORE not-evaluated, because an attestation
    // is precisely what turns "nobody looked" into "somebody looked" — but AFTER the automated
    // findings are collected, because it may never override one.
    const attestation = attestations[rule.id];
    if (attestation) {
      const hits = byRule.get(rule.id) ?? [];
      const verdict = judgeAttestation(rule, attestation, hits, today, currentDigests);
      if (verdict) {
        results.push(verdict);
        continue;
      }
      // Falls through: the attestation did not establish the requirement, so the rule is evaluated
      // normally and typically lands on not-evaluated. Silently ignoring it would be worse.
    }

    // A manual-review rule is never established by an automated run. Without a valid attestation it
    // is not-evaluated, even if the evaluator claims to have examined it and found nothing —
    // "no automated finding" is not evidence for a requirement whose evaluator is a human. Reaching
    // `passed` that way was possible before attestations existed, and it is the false green
    // Standard 24 R2 forbids.
    if (rule.validationType === "manual-review" || !examined.has(rule.id)) {
      results.push(
        base(rule, level, RESULT.skipped, "not-evaluated", `No implemented check evaluates ${rule.id}.`),
      );
      continue;
    }

    const hits = byRule.get(rule.id) ?? [];
    if (hits.length === 0) {
      results.push(base(rule, level, RESULT.passed, "evaluated", `No violation of ${rule.id} was observed.`));
      continue;
    }

    const exception = activeExceptions.get(rule.id);
    const outcome = level === "required" || level === "forbidden" ? RESULT.failed : RESULT.warning;
    const result = base(rule, level, outcome, exception ? "excepted" : "evaluated", hits[0].message);
    result.evidence = hits.flatMap((h) => h.evidence ?? []);
    result.files = result.evidence;
    if (exception) {
      result.exception = {
        reason: exception.reason,
        approvedBy: exception.approvedBy,
        approvedAt: exception.approvedAt,
        expires: exception.expires ?? null,
        reference: exception.reference ?? null,
      };
    }
    results.push(result);
  }

  // Every attempt to waive, downgrade, or reclassify a non-exemptible rule is reported twice: once
  // against the rule that was targeted, and once against integrity.no-manipulation. The first says
  // which protection was attacked; the second is what escalates the verdict to
  // BLOCKED_BY_INVARIANT, so a reader sees both the specific act and what it amounts to.
  const integrityBreaches = [];

  /**
   * Replace a rule's row rather than adding a second one for the same id.
   *
   * Appending was the first implementation and it was wrong: a rule with a rejected exception ended
   * up with both a `passed` row (nothing violated it) and a `failed` row (the waiver was rejected),
   * in that order. Any consumer reading results by rule id — including a person scanning the
   * output — would see the pass and stop. One rule, one row, and the row says the most consequential
   * thing known about it.
   */
  const upsert = (row) => {
    const index = results.findIndex((r) => r.ruleId === row.ruleId);
    if (index === -1) results.push(row);
    else results[index] = row;
  };

  for (const entry of rejectedExceptions) {
    upsert({
      ruleId: entry.rule,
      status: RESULT.failed,
      severity: "error",
      level: "forbidden",
      validationType: "configuration",
      assurance: "full",
      disposition: "rejected-exception",
      message: `${entry.rule} is non-exemptible; the exception against it is rejected, not applied.`,
      evidence: ["project-policy.yml"],
      files: ["project-policy.yml"],
      remediation:
        "Remove the exception and satisfy the rule. If the rule genuinely has no subject in this record, that is determined by the record, not declared in policy.",
    });
    integrityBreaches.push(`an exception was filed against the non-exemptible rule ${entry.rule}`);
  }

  for (const manipulation of invariantManipulations) {
    upsert({
      ruleId: manipulation.rule,
      status: RESULT.failed,
      severity: "error",
      level: "forbidden",
      validationType: "configuration",
      assurance: "full",
      disposition: "rejected-override",
      message: manipulation.message,
      evidence: ["project-policy.yml"],
      files: ["project-policy.yml"],
      remediation: manipulation.remediation,
    });
    integrityBreaches.push(manipulation.message);
  }

  for (const entry of expiredExceptions) {
    upsert({
      ruleId: entry.rule,
      status: RESULT.failed,
      severity: "error",
      level: "required",
      validationType: "configuration",
      assurance: "full",
      disposition: "expired-exception",
      message: `The exception for ${entry.rule} expired on ${entry.expires}.`,
      evidence: ["project-policy.yml"],
      files: ["project-policy.yml"],
      remediation: "Renew the exception with a new approval, or satisfy the rule.",
    });
  }

  // The integrity rule's own result is replaced when a manipulation was detected. It would
  // otherwise sit at not-evaluated (it is manual-review) or attested, either of which would report
  // the system as un-manipulated in the same run that detected a manipulation.
  if (integrityBreaches.length > 0) {
    const integrity = catalog.rules.get(INTEGRITY_RULE);
    const index = results.findIndex((r) => r.ruleId === INTEGRITY_RULE);
    const breach = {
      ruleId: INTEGRITY_RULE,
      status: RESULT.failed,
      severity: "error",
      level: "forbidden",
      validationType: "configuration",
      assurance: "full",
      disposition: "invariant-violated",
      message: `The standards system was manipulated to avoid a rule: ${integrityBreaches.join("; ")}`,
      evidence: ["project-policy.yml"],
      files: ["project-policy.yml"],
      remediation:
        integrity?.remediation ??
        "Restore the rule to its baseline strength and satisfy it, or abstain. If the rule is genuinely wrong, change it deliberately and record why.",
    };
    if (index === -1) results.push(breach);
    else results[index] = breach;
  }

  return summarise(results, policy, catalog);
}

/**
 * Decide what an attestation establishes. Returns a result, or null to fall through to normal
 * evaluation — never a silent success.
 *
 * The rules are ADR 0005's, and the ordering is the interesting part: contradiction is checked
 * first, because a human saying a rule is satisfied does not change what a check observed. Evidence
 * outranks assertion (Standard 38 R4), and that is also why an attestation cannot bypass a
 * nonExemptible rule — not as a separate prohibition, but because the automated failure survives.
 */
function judgeAttestation(rule, attestation, hits, today, digests) {
  const fail = (disposition, message, remediation) => ({
    ruleId: rule.id,
    status: RESULT.failed,
    severity: "error",
    level: "required",
    validationType: "configuration",
    assurance: "full",
    disposition,
    message,
    evidence: ["project-policy.yml"],
    files: ["project-policy.yml"],
    remediation,
  });

  if (!rule.attestable) {
    return fail(
      "invalid-attestation",
      `${rule.id} is not attestable; the catalog says it is evaluated by ${rule.validationType}, not by human review.`,
      "Remove the attestation. A rule the catalog does not mark attestable cannot be satisfied by assertion.",
    );
  }

  if (hits.length > 0) {
    return fail(
      "contradicted-attestation",
      `${rule.id} is attested as approved, but an automated check found: ${hits[0].message}`,
      "Fix the finding. An attestation records human evidence; it never overrides what a check observed.",
    );
  }

  if (attestation.status === "rejected") {
    return fail(
      "attested-rejected",
      `${rule.id} was reviewed by ${attestation.reviewedBy} and found unmet.`,
      "Satisfy the rule, then re-attest. A recorded rejection is a failure, not silence.",
    );
  }

  if (attestation.expires && attestation.expires < today) {
    return null; // Expired: back to not-evaluated. It is not a failure, it is unreviewed again.
  }

  const against = attestation.reviewedAgainst;
  if (against?.digest) {
    const current = digests.get(rule.id);
    if (current && current !== against.digest) {
      return null; // Stale: what was reviewed is not what is there now.
    }
  }

  return {
    ruleId: rule.id,
    status: RESULT.passed,
    severity: rule.severity,
    level: "required",
    validationType: "manual-review",
    // Human judgement establishes the requirement, and does so without a machine. `manualReview` in
    // the assurance breakdown is the honest home for it — never `automated`.
    assurance: "full",
    disposition: "attested",
    message: `Attested by ${attestation.reviewedBy} on ${attestation.reviewedAt}: ${attestation.evidence}`,
    evidence: against?.paths ?? [],
    files: against?.paths ?? [],
    remediation: rule.remediation,
    attestation: {
      reviewedBy: attestation.reviewedBy,
      reviewedAt: attestation.reviewedAt,
      evidence: attestation.evidence,
      reference: attestation.reference ?? null,
      expires: attestation.expires ?? null,
    },
  };
}

function base(rule, level, status, disposition, message) {
  return {
    ruleId: rule.id,
    status,
    severity: rule.severity,
    level,
    validationType: rule.validationType,
    assurance: status === RESULT.skipped ? "none" : rule.assurance,
    disposition,
    message,
    evidence: [],
    files: [],
    remediation: rule.remediation,
  };
}

function summarise(results, policy, catalog) {
  const counts = { passed: 0, failed: 0, warnings: 0, skipped: 0 };
  for (const r of results) {
    if (r.status === RESULT.passed) counts.passed++;
    else if (r.status === RESULT.failed) counts.failed++;
    else if (r.status === RESULT.warning) counts.warnings++;
    else counts.skipped++;
  }

  // Assurance accounts for every applicable rule, and the three MUST sum.
  const assurance = { automated: 0, manualReview: 0, notEvaluated: 0 };
  for (const r of results) {
    if (r.disposition === "not-applicable") continue;
    if (r.status === RESULT.skipped) assurance.notEvaluated++;
    else if (r.validationType === "manual-review") assurance.manualReview++;
    else assurance.automated++;
  }

  const applicable = results.filter((r) => r.disposition !== "not-applicable");
  // Both `required` and `forbidden` count: a prohibition is as binding as an obligation, and
  // omitting the forbidden rules would leave the nineteen must-never rules out of the denominator
  // entirely — the score would then rise as prohibitions were added.
  const scored = applicable.filter(
    (r) => r.status !== RESULT.skipped && (r.level === "required" || r.level === "forbidden"),
  );
  const scoredPassed = scored.filter((r) => r.status === RESULT.passed).length;
  const score = scored.length === 0 ? null : Math.round((scoredPassed / scored.length) * 100);

  const failures = results.filter((r) => r.status === RESULT.failed && r.disposition !== "excepted");
  const excepted = results.filter((r) => r.disposition === "excepted");

  // A failing non-exemptible rule is not an ordinary failure. It means the work cannot proceed on
  // this evidence, and an agent reading the verdict should stop rather than look for a way around
  // it (Standard 18 R5). Checked before the ordinary failure branch so it always wins.
  const invariantFailures = failures.filter((r) => {
    if (r.disposition === "invariant-violated" || r.disposition === "rejected-exception") return true;
    if (r.disposition === "rejected-override") return true;
    return catalog?.rules.get(r.ruleId)?.nonExemptible === true;
  });

  let status;
  if (!policy) status = STATUS.NOT_EVALUATED;
  else if (invariantFailures.length > 0) status = STATUS.BLOCKED_BY_INVARIANT;
  else if (failures.length > 0) status = STATUS.INSUFFICIENTLY_SUPPORTED;
  else if (excepted.length > 0) status = STATUS.SUPPORTED_WITH_EXCEPTIONS;
  else status = STATUS.SUPPORTED;

  return {
    status,
    score,
    summary: counts,
    assurance,
    blockedBy: invariantFailures.map((r) => r.ruleId),
    denominator: {
      total: results.length,
      applicable: applicable.length,
      scored: scored.length,
      basis: "required- and forbidden-level rules that were evaluated",
    },
    results,
  };
}

/**
 * The report envelope. `schemaVersion` versions this format independently of the standards version
 * and the record schema version, so a change to one is never mistaken for a change to another.
 */
export function envelope({
  verdict,
  project,
  standardVersion,
  evaluatedAt,
  asOf,
  record,
  parameters,
  frameworkCoverage,
}) {
  return {
    schemaVersion: "1.0",
    standardVersion: standardVersion ?? null,
    project: project ?? null,
    record: record ?? null,
    status: verdict.status,
    score: verdict.score,
    summary: verdict.summary,
    assurance: verdict.assurance,
    blockedBy: verdict.blockedBy ?? [],
    denominator: verdict.denominator,
    // The thresholds this verdict was reached under. Published because a verdict that depends on a
    // materiality threshold nobody can see is a verdict nobody can check.
    parameters: parameters ?? null,
    // Framework maturity, sitting outside the verdict on purpose. It says how much of the framework
    // has been turned into evaluated rules — never how well supported this prediction is. Combining
    // the two would let a coverage improvement look like a support improvement.
    frameworkCoverage: frameworkCoverage ?? null,
    evaluatedAt,
    // The instant all staleness and expiry arithmetic ran against, so a report can be reproduced.
    asOf: asOf ?? null,
    results: verdict.results,
  };
}
