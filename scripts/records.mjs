/**
 * The detectors: a prediction record in, findings out.
 *
 * Every function here answers one question about one record and reports against a catalog rule id.
 * `assertBindings` in scripts/catalog.mjs throws if a finding names a rule the catalog does not
 * define, so this file cannot grow its own vocabulary — the catalog holds identity, this holds
 * computation, and neither may invent the other's content.
 *
 * TWO KINDS OF CHECK, AND THE DIFFERENCE MATTERS.
 *
 *   Recomputation — edge, expected value, overround, ensemble spread, interval coherence. These are
 *   determined by numbers already in the record, so a mismatch is always a real defect and the
 *   finding is labelled OBSERVED.
 *
 *   Declaration — nearly everything else. The record says it assessed outliers, accounted for
 *   staleness, or judged some gap immaterial, and the check confirms the statement exists. It
 *   cannot confirm the statement is true. Those rules carry `partial` assurance and a
 *   `$assuranceNote` saying so, and heuristic findings are labelled INFERRED.
 *
 * Reporting the second kind as though it were the first is the false green this repository exists
 * to prevent, so the distinction is carried all the way into each finding's evidence label.
 *
 * DETERMINISM. Nothing here reads the wall clock. Every staleness and expiry comparison runs
 * against the `asOf` instant the caller supplies, so two runs over the same inputs produce the same
 * verdict — which is what makes a report reproducible and a test meaningful.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { validate } from "./jsonschema.mjs";

/**
 * Thresholds used when a project policy declares none.
 *
 * NONE OF THESE COMES FROM THE SOURCE SPECIFICATION. They are working defaults chosen so the
 * evaluator runs out of the box, and every one of them is a domain judgement a project should
 * revisit: a minimum sample of 30 is comfortable for a stable high-frequency process and hopeless
 * for a rare event. The evaluator publishes the values it used in every report, so a verdict never
 * rests on a threshold the reader cannot see.
 */
export const DEFAULT_PARAMETERS = {
  minSampleSize: 30,
  disagreementThreshold: 0.1,
  materialityThreshold: 0.01,
  tolerance: 0.0001,
  defaultFreshnessWindow: "P7D",
  confidenceVocabulary: null,
};

/** A tier that is really a number wearing a label: `0.9`, `90%`, `85 %`. */
const NUMERIC_TIER = /^[0-9.]+\s*%?$/;

export function resolveParameters(policy) {
  return { ...DEFAULT_PARAMETERS, ...(policy?.parameters ?? {}) };
}

/** Parse the ISO-8601 duration subset the schema admits into milliseconds. */
export function durationToMs(duration) {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    duration ?? "",
  );
  if (!m) return null;
  const [, y, mo, w, d, h, mi, s] = m.map((v) => (v === undefined ? 0 : Number(v)));
  // Years and months are approximated: a freshness window is a tolerance, not a calendar
  // appointment, and no prediction should hinge on whether a month is 30 or 31 days. Anything
  // needing exactness should be expressed in days.
  return (
    ((y * 365 + mo * 30 + w * 7 + d) * 24 * 60 * 60 + h * 60 * 60 + mi * 60 + s) * 1000
  );
}

const ms = (iso) => (iso ? Date.parse(iso) : NaN);

/** Decimal places in a stated probability, preferring the string form JSON cannot preserve. */
export function statedDecimals(output) {
  const stated = output?.probabilityStated;
  if (typeof stated === "string") return (stated.split(".")[1] ?? "").length;
  const value = output?.probability;
  if (typeof value !== "number") return 0;
  const repr = String(value);
  return repr.includes(".") ? repr.split(".")[1].length : 0;
}

/** Convert a quoted price to the probability it implies, before any margin removal. */
export function rawImplied(entry) {
  if (entry.format === "probability") return entry.price;
  if (entry.format === "decimal") return entry.price > 0 ? 1 / entry.price : NaN;
  if (entry.format === "american") {
    if (entry.price > 0) return 100 / (entry.price + 100);
    if (entry.price < 0) return -entry.price / (-entry.price + 100);
  }
  return NaN;
}

/**
 * Rules whose subject can be absent from an individual record, and the reason to report when it is.
 * Consulted by the evaluator to produce `not-applicable` dispositions that quote the record's own
 * declaration rather than a generic phrase (ADR 0005).
 */
export function recordApplicability(record) {
  const notApplicable = new Map();
  const output = record?.output ?? {};
  const isAbstention = output.type === "abstention";

  const mark = (ids, reason) => {
    for (const id of ids) if (!notApplicable.has(id)) notApplicable.set(id, reason);
  };

  if (isAbstention) {
    mark(
      [
        "uncertainty.interval-present",
        "uncertainty.interval-coherent",
        "expiration.expiry-present",
        "expiration.expiry-after-generation",
        "market.reference-present-or-declared-absent",
        "market.implied-probability-consistent",
        "market.vig-removed",
        "edge.requires-market-reference",
        "edge.recomputable",
        "edge.not-fabricated",
        "ev.requires-stake-context",
        "ev.recomputable",
        "confidence.definitions-declared",
        "confidence.tier-from-vocabulary",
        "confidence.not-probability",
        "confidence.not-fabricated",
        "ensemble.members-enumerated",
        "ensemble.aggregation-stated",
        "ensemble.disagreement-declared",
        "ensemble.no-cherry-picking",
        "precision.supported-by-sample",
        "precision.material-difference-justified",
        "probability.not-expected-value",
        "probability.not-fabricated",
        "data.missing-critical-blocks",
        "data.sample-size-sufficient",
        "abstention.no-manufactured-prediction",
      ],
      "This record is an abstention; the rule's subject is a prediction output.",
    );
    return notApplicable;
  }

  if (record?.market?.declaredAbsent) {
    const reason = `No market reference: ${record.market.reason}`;
    mark(["market.implied-probability-consistent", "market.vig-removed"], reason);
    if (record.edge === undefined) {
      mark(["edge.recomputable", "edge.not-fabricated"], reason);
    }
  }
  if (record?.edge === undefined) {
    mark(
      ["edge.requires-market-reference", "edge.recomputable", "edge.not-fabricated"],
      "This record states no edge.",
    );
  }
  if (record?.expectedValue === undefined) {
    mark(
      ["ev.requires-stake-context", "ev.recomputable"],
      "This record states no expected value.",
    );
  }
  if (record?.ensemble === undefined) {
    mark(
      [
        "ensemble.members-enumerated",
        "ensemble.aggregation-stated",
        "ensemble.disagreement-declared",
        "ensemble.no-cherry-picking",
      ],
      // Adoption #1 (F2), #2 (G2), and #3 all found this reason asserting a second clause —
      // "a single method produced the prediction" — which is inferred from a missing field and was
      // stated as observed. In #2 it was flatly contradicted by the source, which combines five
      // weighted subscores. The disposition was correct in all three; only the sentence was wrong.
      // A not-applicable reason states what was observed about the record and nothing further:
      // the absence of the block is observable, what produced the prediction instead is not.
      // See artifacts/release-review/v1.1-evidence-review.md (R1 / candidate C1).
      "This record states no ensemble.",
    );
  }
  return notApplicable;
}

/**
 * The rule ids a detector in this file can report against.
 *
 * This is the anti-false-green boundary. Every catalog rule NOT in this set is reported
 * `skipped / not-evaluated` by the compliance engine rather than passing, because nothing here
 * looked at it. A test asserts that this list and the detectors agree, so a rule cannot drift into
 * looking evaluated when its detector was removed (Standard 18 R4).
 */
export const EVALUATED_RULES = [
  "record.schema-valid",
  "record.identity-present",
  "probability.definition-complete",
  "probability.in-unit-interval",
  "probability.methodology-declared",
  "probability.methodology-change-declared",
  "probability.not-expected-value",
  "probability.not-fabricated",
  "uncertainty.interval-present",
  "uncertainty.interval-coherent",
  "calibration.claim-requires-measurement",
  "calibration.no-lookahead-generation",
  "baseline.present-or-declared-absent",
  "baseline.source-stated",
  "data.freshness-declared",
  "data.staleness-accounted",
  "data.completeness-declared",
  "data.missing-critical-blocks",
  "data.sample-size-declared",
  "data.sample-size-sufficient",
  "data.outliers-handled",
  "regime.change-assessed",
  "regime.change-accounted",
  "ensemble.members-enumerated",
  "ensemble.aggregation-stated",
  "ensemble.disagreement-declared",
  "ensemble.no-cherry-picking",
  "precision.supported-by-sample",
  "precision.material-difference-justified",
  "expiration.expiry-present",
  "expiration.expiry-after-generation",
  "market.reference-present-or-declared-absent",
  "market.implied-probability-consistent",
  "market.vig-removed",
  "edge.requires-market-reference",
  "edge.recomputable",
  "edge.not-fabricated",
  "ev.requires-stake-context",
  "ev.recomputable",
  "confidence.definitions-declared",
  "confidence.tier-from-vocabulary",
  "confidence.not-probability",
  "confidence.not-fabricated",
  "abstention.first-class-output",
  "abstention.valid-shape",
  "abstention.no-manufactured-prediction",
];

/**
 * Evaluate one record. Returns findings; an empty array means no violation was observed, which is
 * not the same as everything being fine — see EVALUATED_RULES.
 *
 * @param record      the parsed record
 * @param schema      the prediction-record schema
 * @param parameters  resolved thresholds
 * @param asOf        the instant staleness and expiry are measured against
 */
export function inspect({ record, schema, parameters, asOf }) {
  const findings = [];
  const now = ms(asOf);

  /** label: OBSERVED for a check resting on a defined structure, INFERRED for a heuristic. */
  const report = (rule, message, { label = "OBSERVED", evidence = [] } = {}) =>
    findings.push({ rule, message, label, evidence });

  const output = record?.output ?? {};
  const isPrediction = output.type === "prediction";
  const isAbstention = output.type === "abstention";

  // D1 — schema conformance. Reported as a finding rather than thrown: a record that fails here is
  // still worth inspecting field by field, and stopping would report one problem where there are
  // several.
  const schemaErrors = validate(record, schema);
  for (const error of schemaErrors.slice(0, 10)) {
    report("record.schema-valid", `${error.path || "(document)"}: ${error.message}`, {
      evidence: [error.path || "(document)"],
    });
  }

  // D2 — identity and a resolvable subject.
  const subject = record?.subject ?? {};
  for (const [field, rule] of [
    ["id", "record.identity-present"],
    ["subject.event", "probability.definition-complete"],
    ["subject.outcomeDefinition", "probability.definition-complete"],
    ["subject.resolutionSource", "probability.definition-complete"],
  ]) {
    const value = field === "id" ? record?.id : subject[field.split(".")[1]];
    if (typeof value !== "string" || value.trim() === "") {
      report(rule, `${field} is required and must not be empty.`, { evidence: [field] });
    }
  }

  // D3 — every probability-shaped number in the unit interval.
  const probabilities = [
    ["output.probability", output.probability],
    ["output.interval.lower", output.interval?.lower],
    ["output.interval.upper", output.interval?.upper],
    ["baseline.probability", record?.baseline?.probability],
    ["market.impliedProbability", record?.market?.impliedProbability],
    ...(record?.ensemble?.members ?? []).map((m, i) => [`ensemble.members[${i}].probability`, m.probability]),
  ];
  for (const [where, value] of probabilities) {
    if (typeof value === "number" && (value < 0 || value > 1)) {
      report("probability.in-unit-interval", `${where} is ${value}, outside [0, 1].`, { evidence: [where] });
    }
  }

  // D4 — the uncertainty interval.
  if (isPrediction) {
    const interval = output.interval;
    if (!interval) {
      report("uncertainty.interval-present", "A prediction must state an uncertainty interval.", {
        evidence: ["output.interval"],
      });
    } else {
      if (interval.lower > interval.upper) {
        report(
          "uncertainty.interval-coherent",
          `The interval lower bound ${interval.lower} exceeds the upper bound ${interval.upper}.`,
          { evidence: ["output.interval"] },
        );
      } else if (output.probability < interval.lower || output.probability > interval.upper) {
        report(
          "uncertainty.interval-coherent",
          `The estimate ${output.probability} lies outside its own interval [${interval.lower}, ${interval.upper}].`,
          { evidence: ["output.interval"] },
        );
      }
    }
  }

  // D5 — baseline.
  const baseline = record?.baseline;
  if (!baseline) {
    report("baseline.present-or-declared-absent", "State a baseline probability, or declare its absence with a reason.", {
      evidence: ["baseline"],
    });
  } else if (!baseline.declaredAbsent) {
    if (typeof baseline.probability !== "number") {
      report("baseline.present-or-declared-absent", "The baseline states no probability and does not declare its absence.", {
        evidence: ["baseline"],
      });
    }
    for (const field of ["source", "basis"]) {
      if (typeof baseline[field] !== "string" || baseline[field].trim() === "") {
        report("baseline.source-stated", `The baseline does not state its ${field}.`, {
          evidence: [`baseline.${field}`],
        });
      }
    }
  }

  // D6 — freshness and staleness. All arithmetic against `asOf`, never the wall clock.
  const freshness = record?.data?.freshness;
  if (!freshness?.dataAsOf) {
    report("data.freshness-declared", "State the instant the underlying data describes.", {
      evidence: ["data.freshness.dataAsOf"],
    });
  } else {
    const windowMs = durationToMs(freshness.freshnessWindow ?? parameters.defaultFreshnessWindow);
    const generated = ms(record?.generatedAt);
    if (windowMs !== null && Number.isFinite(generated)) {
      const age = generated - ms(freshness.dataAsOf);
      if (age > windowMs && !freshness.stalenessAccounted) {
        const days = (age / 86400000).toFixed(1);
        report(
          "data.staleness-accounted",
          `The data was ${days} days old at generation, past its ${freshness.freshnessWindow ?? parameters.defaultFreshnessWindow} window, with no account of how that was allowed for.`,
          { evidence: ["data.freshness"] },
        );
      }
    }
  }

  // D7 — completeness.
  const completeness = record?.data?.completeness;
  if (!completeness || !Array.isArray(completeness.knownGaps) || !Array.isArray(completeness.criticalMissing)) {
    report("data.completeness-declared", "Declare known gaps and critical missing information, using empty arrays deliberately.", {
      evidence: ["data.completeness"],
    });
  } else if (isPrediction && completeness.criticalMissing.length > 0 && !completeness.justification) {
    report(
      "data.missing-critical-blocks",
      `Critical information is missing (${completeness.criticalMissing.join("; ")}) with no justification for predicting anyway.`,
      { evidence: ["data.completeness.criticalMissing"] },
    );
  }

  // D8 — sample size.
  const sample = record?.data?.sampleSize;
  if (!sample || typeof sample.n !== "number" || !sample.unit || !sample.basis) {
    report("data.sample-size-declared", "State the sample count, its unit, and its basis.", {
      evidence: ["data.sampleSize"],
    });
  } else if (isPrediction && sample.n < parameters.minSampleSize && !sample.justification) {
    report(
      "data.sample-size-sufficient",
      `The sample of ${sample.n} ${sample.unit} is below the project minimum of ${parameters.minSampleSize} with no justification.`,
      { evidence: ["data.sampleSize"] },
    );
  }

  // D9 — outliers.
  const outliers = record?.data?.outliers;
  if (!outliers || typeof outliers.assessed !== "boolean") {
    report("data.outliers-handled", "State whether outliers were assessed.", { evidence: ["data.outliers"] });
  } else if (outliers.detected === true && !outliers.handling) {
    report("data.outliers-handled", "Outliers were detected but the record does not say how they were treated.", {
      evidence: ["data.outliers"],
    });
  }

  // D10 — regime.
  const regime = record?.regime;
  if (!regime || typeof regime.assessed !== "boolean") {
    report("regime.change-assessed", "State whether the underlying regime was assessed.", { evidence: ["regime"] });
  } else if (regime.changeDetected === true && !regime.accountedFor) {
    report("regime.change-accounted", "A regime change was detected but the record does not say how it was accounted for.", {
      evidence: ["regime"],
    });
  }

  // D11 — false precision.
  //
  // The criterion: a probability may be stated to as many decimal places as the position of the
  // standard error's first significant digit, and no more. With a standard error of 0.077 the first
  // significant digit falls in the second decimal place, so two decimals is the most that can be
  // justified and 0.6237 is claiming two digits of noise.
  //
  // The cruder alternative — requiring the stated resolution to be no finer than the standard error
  // itself — was tried first and rejected: it is not monotone in the sample size (it happened to
  // allow two decimals at n=2400 while refusing three at n=9400), and it fails almost every record
  // stating an ordinary two decimal places. A check that fails correct records gets disabled.
  //
  // INFERRED: the binomial standard error assumes independent observations and takes the declared
  // sample at face value, so this bounds obvious overstatement rather than establishing adequacy.
  if (isPrediction && typeof sample?.n === "number" && sample.n > 0 && typeof output.probability === "number") {
    const decimals = statedDecimals(output);
    const p = output.probability;
    const standardError = Math.sqrt(Math.max(p * (1 - p), Number.EPSILON) / sample.n);
    const maxDecimals = Math.max(0, Math.ceil(-Math.log10(standardError)));
    if (decimals > maxDecimals) {
      report(
        "precision.supported-by-sample",
        `The probability is stated to ${decimals} decimal places, but a sample of ${sample.n} gives a standard error of ${standardError.toFixed(4)}, which supports at most ${maxDecimals}.`,
        { label: "INFERRED", evidence: ["output.probability", "data.sampleSize"] },
      );
    }
  }

  // D12 — materiality of a small difference.
  if (isPrediction) {
    const edgeValue = record?.edge?.value;
    if (typeof edgeValue === "number" && Math.abs(edgeValue) < parameters.materialityThreshold && !record.edge.materialityNote) {
      report(
        "precision.material-difference-justified",
        `The stated edge of ${edgeValue} is below the materiality threshold of ${parameters.materialityThreshold} with no explanation of why it is meaningful.`,
        { evidence: ["edge"] },
      );
    }
  }

  // D13 — expiry.
  if (isPrediction) {
    if (!record?.expiresAt) {
      report("expiration.expiry-present", "A prediction must state when it expires.", { evidence: ["expiresAt"] });
    } else if (ms(record.expiresAt) <= ms(record.generatedAt)) {
      report(
        "expiration.expiry-after-generation",
        `expiresAt (${record.expiresAt}) is not after generatedAt (${record.generatedAt}).`,
        { evidence: ["expiresAt", "generatedAt"] },
      );
    }
  }

  // D14 — market reference, overround, and de-vigging.
  const market = record?.market;
  if (isPrediction) {
    if (!market) {
      report(
        "market.reference-present-or-declared-absent",
        "State a market-implied probability, or declare that no market reference exists and why.",
        { evidence: ["market"] },
      );
    } else if (!market.declaredAbsent && Array.isArray(market.raw) && market.raw.length > 0) {
      const implied = market.raw.map(rawImplied);
      if (implied.every((v) => Number.isFinite(v))) {
        const total = implied.reduce((a, b) => a + b, 0);
        const overround = total - 1;
        if (overround > parameters.tolerance && market.vig?.removed !== true) {
          report(
            "market.vig-removed",
            `The quoted prices imply a total of ${total.toFixed(4)} (overround ${overround.toFixed(4)}), which was not removed before treating them as probabilities.`,
            { evidence: ["market.raw", "market.vig"] },
          );
        }
        if (market.vig?.method === "proportional") {
          // The first raw price is the outcome being predicted, by the schema's convention that
          // raw[0] is this record's subject.
          const expected = implied[0] / total;
          if (Math.abs(expected - market.impliedProbability) > parameters.tolerance) {
            report(
              "market.implied-probability-consistent",
              `Proportional de-vigging of the quoted prices gives ${expected.toFixed(6)}, but the record states ${market.impliedProbability}.`,
              { evidence: ["market.impliedProbability", "market.raw"] },
            );
          }
        }
      }
    }
  }

  // D15 — edge. Fully recomputable, so any mismatch is a real defect.
  const edge = record?.edge;
  if (edge !== undefined) {
    const impliedProbability = market?.declaredAbsent ? undefined : market?.impliedProbability;
    if (typeof impliedProbability !== "number") {
      const message = "An edge is stated but the record carries no market-implied probability to measure it against.";
      report("edge.requires-market-reference", message, { evidence: ["edge", "market"] });
      report("edge.not-fabricated", message, { evidence: ["edge", "market"] });
    } else if (typeof output.probability === "number") {
      const expected = output.probability - impliedProbability;
      if (Math.abs(expected - edge.value) > parameters.tolerance) {
        const message = `The stated edge of ${edge.value} does not equal probability minus market-implied (${output.probability} − ${impliedProbability} = ${expected.toFixed(6)}).`;
        report("edge.recomputable", message, { evidence: ["edge.value"] });
        report("edge.not-fabricated", message, { evidence: ["edge.value"] });
      }
    }
  }

  // D16 — expected value.
  const ev = record?.expectedValue;
  if (ev !== undefined) {
    if (typeof ev.stake !== "number" || typeof ev.payout !== "number") {
      report("ev.requires-stake-context", "An expected value requires a stake and a payout.", {
        evidence: ["expectedValue"],
      });
    } else if (typeof output.probability === "number") {
      const expected = output.probability * (ev.payout - ev.stake) - (1 - output.probability) * ev.stake;
      if (Math.abs(expected - ev.value) > parameters.tolerance) {
        report(
          "ev.recomputable",
          `The stated expected value of ${ev.value} does not follow from the probability, stake, and payout (expected ${expected.toFixed(4)}). A common cause is treating payout as the net win rather than the total return.`,
          { evidence: ["expectedValue"] },
        );
      }
    }
  }

  // D17 — ensemble composition and disagreement.
  const ensemble = record?.ensemble;
  if (ensemble) {
    const members = ensemble.members ?? [];
    if (members.length < 2) {
      report("ensemble.members-enumerated", "An ensemble states fewer than two members; list every model that contributed.", {
        evidence: ["ensemble.members"],
      });
    }
    for (const [i, member] of members.entries()) {
      if (!member.name || !member.version || typeof member.probability !== "number") {
        report("ensemble.members-enumerated", `ensemble.members[${i}] must state a name, a version, and a probability.`, {
          evidence: [`ensemble.members[${i}]`],
        });
      }
    }
    if (!ensemble.aggregation?.method) {
      report("ensemble.aggregation-stated", "State how member probabilities were combined.", {
        evidence: ["ensemble.aggregation"],
      });
    }
    const values = members.map((m) => m.probability).filter((v) => typeof v === "number");
    if (values.length >= 2) {
      const spread = Math.max(...values) - Math.min(...values);
      if (spread > parameters.disagreementThreshold) {
        if (ensemble.disagreement?.declared !== true) {
          report(
            "ensemble.disagreement-declared",
            `Member probabilities span ${spread.toFixed(4)}, above the project threshold of ${parameters.disagreementThreshold}, and the disagreement is not declared.`,
            { evidence: ["ensemble.members", "ensemble.disagreement"] },
          );
        } else if (!ensemble.disagreement.note) {
          report(
            "ensemble.disagreement-declared",
            `The disagreement of ${spread.toFixed(4)} is declared but the record does not say what it means for the prediction.`,
            { evidence: ["ensemble.disagreement"] },
          );
        }
      }
      if (
        ensemble.disagreement?.spread !== undefined &&
        Math.abs(ensemble.disagreement.spread - spread) > parameters.tolerance
      ) {
        report(
          "ensemble.disagreement-declared",
          `The stated spread of ${ensemble.disagreement.spread} does not match the members, which span ${spread.toFixed(4)}.`,
          { evidence: ["ensemble.disagreement.spread"] },
        );
      }
    }
    for (const [i, excluded] of (ensemble.excluded ?? []).entries()) {
      if (!excluded.reason || excluded.reason.trim() === "") {
        report("ensemble.no-cherry-picking", `ensemble.excluded[${i}] (${excluded.name}) gives no reason for its exclusion.`, {
          evidence: [`ensemble.excluded[${i}]`],
        });
      }
    }
  }

  // D18 — confidence.
  if (isPrediction) {
    const confidence = record?.confidence;
    if (!confidence) {
      report("confidence.definitions-declared", "A prediction must state a confidence tier.", {
        evidence: ["confidence"],
      });
    } else {
      const vocabulary =
        confidence.vocabularyRef === "inline" ? confidence.vocabulary : parameters.confidenceVocabulary;
      if (!Array.isArray(vocabulary) || vocabulary.length === 0) {
        report(
          "confidence.definitions-declared",
          confidence.vocabularyRef === "inline"
            ? "The record declares an inline confidence vocabulary but does not carry one."
            : "The record refers to the project's confidence vocabulary, but the policy declares none.",
          { evidence: ["confidence"] },
        );
        report("confidence.not-fabricated", "The stated tier resolves to no definition.", {
          evidence: ["confidence.tier"],
        });
      } else {
        const undefinedTiers = vocabulary.filter((t) => !t.definition || t.definition.trim() === "");
        for (const tier of undefinedTiers) {
          report("confidence.definitions-declared", `The tier '${tier.tier}' carries no definition.`, {
            evidence: ["confidence"],
          });
        }
        if (!vocabulary.some((t) => t.tier === confidence.tier)) {
          report(
            "confidence.tier-from-vocabulary",
            `The tier '${confidence.tier}' does not appear in the declared vocabulary (${vocabulary.map((t) => t.tier).join(", ")}).`,
            { evidence: ["confidence.tier"] },
          );
          report("confidence.not-fabricated", `The tier '${confidence.tier}' resolves to no definition.`, {
            evidence: ["confidence.tier"],
          });
        }
      }
      if (typeof confidence.tier === "string" && NUMERIC_TIER.test(confidence.tier.trim())) {
        report(
          "confidence.not-probability",
          `The confidence tier '${confidence.tier}' is a number. Confidence is categorical; expressing it numerically invites it to be read as, or compared against, the probability.`,
          { evidence: ["confidence.tier"] },
        );
      }
    }
  }

  // D19 — calibration.
  const calibration = record?.calibration;
  if (calibration) {
    if (calibration.measured === false && calibration.score) {
      report(
        "calibration.claim-requires-measurement",
        "A calibration score is stated while measured is false. A score with no measurement behind it is a claim to have checked.",
        { evidence: ["calibration"] },
      );
    }
    if (calibration.measured === true) {
      for (const field of ["method", "dataset", "asOf"]) {
        if (!calibration[field]) {
          report("calibration.claim-requires-measurement", `Calibration is claimed as measured but states no ${field}.`, {
            evidence: [`calibration.${field}`],
          });
        }
      }
    }
  }

  // D20 — lookahead in a historical reconstruction.
  const historical = record?.provenance?.historical;
  if (historical?.isHistorical === true) {
    if (!historical.informationCutoff) {
      report(
        "calibration.no-lookahead-generation",
        "A historical reconstruction must declare the information cutoff it was made under.",
        { evidence: ["provenance.historical"] },
      );
    } else {
      const cutoff = ms(historical.informationCutoff);
      for (const [i, source] of (record?.provenance?.dataSources ?? []).entries()) {
        if (ms(source.asOf) > cutoff) {
          report(
            "calibration.no-lookahead-generation",
            `Data source '${source.name}' is as-of ${source.asOf}, after the declared information cutoff of ${historical.informationCutoff}.`,
            { evidence: [`provenance.dataSources[${i}]`] },
          );
        }
      }
    }
  }

  // D20b — the abstention's own shape. The schema enforces most of this; what remains is the
  // cross-variant check, since a record could carry top-level prediction fields alongside one.
  if (isAbstention) {
    for (const [field, value] of [
      ["edge", record?.edge],
      ["expectedValue", record?.expectedValue],
      ["expiresAt", record?.expiresAt],
    ]) {
      if (value !== undefined) {
        report("abstention.valid-shape", `An abstention must not carry ${field}.`, { evidence: [field] });
      }
    }
  }

  // D20c — the manufactured prediction. Aggregates conditions the record declares ABOUT ITSELF,
  // which is why the rule carries partial assurance: a record that understates its own gaps passes
  // this while violating what it stands for. INFERRED, because the conclusion is drawn from other
  // declarations rather than observed directly.
  if (isPrediction) {
    const signals = [];
    if (completeness?.criticalMissing?.length > 0 && !completeness.justification) {
      signals.push(`critical information missing without justification (${completeness.criticalMissing.join("; ")})`);
    }
    if (freshness?.dataAsOf) {
      const windowMs = durationToMs(freshness.freshnessWindow ?? parameters.defaultFreshnessWindow);
      const age = ms(record?.generatedAt) - ms(freshness.dataAsOf);
      if (windowMs !== null && age > windowMs && !freshness.stalenessAccounted) {
        signals.push("data past its freshness window with no account of staleness");
      }
    }
    if (typeof sample?.n === "number" && sample.n < parameters.minSampleSize && !sample.justification) {
      signals.push(`a sample of ${sample.n} below the project minimum of ${parameters.minSampleSize}, unjustified`);
    }
    const values = (ensemble?.members ?? []).map((m) => m.probability).filter((v) => typeof v === "number");
    if (values.length >= 2) {
      const spread = Math.max(...values) - Math.min(...values);
      if (spread > parameters.disagreementThreshold && ensemble?.disagreement?.declared !== true) {
        signals.push(`undeclared model disagreement of ${spread.toFixed(4)}`);
      }
    }
    if (signals.length > 0) {
      report(
        "abstention.no-manufactured-prediction",
        `This record predicts while declaring the evidence insufficient: ${signals.join("; ")}. Abstention is a supported outcome.`,
        { label: "INFERRED", evidence: ["output", "data"] },
      );
    }
  }

  return findings;
}

/**
 * The abstention variant must remain expressible. Checked against the schema itself rather than
 * against any record, because it is a property of the format: a system whose output format cannot
 * say "no prediction" forces a number in every case (Standard 17 R1).
 */
export function inspectSchema(schema) {
  const variants = schema?.$defs?.output?.oneOf ?? [];
  const abstention = variants.find((v) => v?.properties?.type?.const === "abstention");
  const findings = [];
  if (!abstention) {
    findings.push({
      rule: "abstention.first-class-output",
      message: "The record schema admits no abstention variant; abstention must be representable on equal footing with a prediction.",
      label: "OBSERVED",
      evidence: ["schemas/prediction-record.schema.json"],
    });
  } else if (abstention.properties?.statement?.const !== "NO PREDICTION / INSUFFICIENT EVIDENCE") {
    findings.push({
      rule: "abstention.first-class-output",
      message: "The abstention variant does not fix the standard statement, so an abstention could be softened into something that reads like a weak prediction.",
      label: "OBSERVED",
      evidence: ["schemas/prediction-record.schema.json"],
    });
  }
  return findings;
}

/**
 * Cross-record check: a methodology change between successive records in a series must be declared.
 * Only observable when records share a seriesId and are evaluated together, which the rule's
 * assurance note states.
 *
 * @param records  [{ file, record }]
 * @returns Map<file, finding[]>
 */
export function inspectSeries(records) {
  const bySeries = new Map();
  for (const entry of records) {
    const seriesId = entry.record?.seriesId;
    if (!seriesId) continue;
    if (!bySeries.has(seriesId)) bySeries.set(seriesId, []);
    bySeries.get(seriesId).push(entry);
  }

  const findings = new Map();
  for (const [seriesId, entries] of bySeries) {
    const ordered = [...entries].sort((a, b) => ms(a.record.generatedAt) - ms(b.record.generatedAt));
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1].record.methodology ?? {};
      const current = ordered[i].record.methodology ?? {};
      if (current.version === previous.version) continue;
      if (current.changedFromPrevious === true && current.changeNote) continue;
      const list = findings.get(ordered[i].file) ?? [];
      list.push({
        rule: "probability.methodology-change-declared",
        message: `Series '${seriesId}': methodology version changed from ${previous.version} to ${current.version} without declaring the change${current.changedFromPrevious === true ? " (changedFromPrevious is set but changeNote is missing)" : ""}.`,
        label: "OBSERVED",
        evidence: ["methodology"],
      });
      findings.set(ordered[i].file, list);
    }
  }
  return findings;
}

/** Read one record, or every *.json record in a directory, in a stable order. */
export async function loadRecords(target) {
  const stat = await import("node:fs/promises").then((fs) => fs.stat(target));
  const files = stat.isDirectory()
    ? (await readdir(target, { recursive: true }))
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => path.join(target, f))
    : [target];

  const loaded = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    try {
      loaded.push({ file, record: JSON.parse(text) });
    } catch (error) {
      // A parse failure is a configuration fault, not an unsupported prediction: the caller turns
      // this into NOT_EVALUATED and exit 2 rather than a failing verdict.
      loaded.push({ file, record: null, parseError: error.message });
    }
  }
  return loaded;
}
