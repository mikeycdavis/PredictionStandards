#!/usr/bin/env node
/**
 * `predictions` — the command line for the prediction standards.
 *
 * FIVE COMMANDS, CHOSEN FOR THE DOMAIN WORKFLOWS RATHER THAN COPIED FROM A LIST. The
 * standards-system specification offers `init plan check audit explain status` as candidates and
 * says not to adopt them blindly. What a prediction workflow actually needs:
 *
 *   init     scaffold a policy and a template record into a project
 *   audit    what does this record contain, and where does it depart from the standards?
 *            Evidence only. No policy, no verdict.
 *   check    is this prediction sufficiently supported? Policy-aware, produces the verdict.
 *   explain  why did each rule apply or not apply, and what evidence was found?
 *   status   the posture of a whole directory of records, with framework coverage beside it.
 *
 * `plan` was dropped: there is no multi-step mutation to preview here, and the one command that
 * mutates (`init`) has its own --dry-run derived from the same plan object it applies.
 *
 * AUDIT AND CHECK ARE SEPARATE COMMANDS WITH DIFFERENT EXIT CONTRACTS, and no flag moves one into
 * the other. Evidence discovery and verdict are different jobs; a consumer that has to guess which
 * one it got is a consumer that will guess wrong.
 *
 * Exit codes:
 *   0  the command completed; for `check`, the record is supported
 *   1  the command completed; for `check`, the record is not supported or is blocked
 *   2  the command could not reach a conclusion: bad invocation, unreadable record, invalid policy
 *
 * The 1/2 split matters to CI. 1 means this tool worked and the prediction has problems; 2 means it
 * could not reach a verdict at all. Collapsing them tells CI that a broken evaluator is a failing
 * prediction, and the usual response to that is to weaken the check.
 */

import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";

import { loadCatalog, assertBindings, coverage, CatalogError, CATALOG_DIR } from "./catalog.mjs";
import {
  evaluate,
  envelope,
  aggregateStatus,
  REPORT_SCHEMA_VERSION,
  STATUS,
} from "./compliance.mjs";
import { checkPolicy } from "./policy.mjs";
import { firstConflict, physicalDestination } from "./path-guard.mjs";
import { describeFailure, notAttempted, readRegister, resolveVersion, REGISTER_PATH } from "./release-register.mjs";
import {
  EVALUATED_RULES,
  inspect,
  inspectSchema,
  inspectSeries,
  loadRecords,
  recordApplicability,
  recordNotEvaluated,
  resolveParameters,
} from "./records.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_SCHEMA = path.join(ROOT, "schemas/prediction-record.schema.json");
const POLICY_SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const TOTAL_STANDARDS = 19;

function usage() {
  return `Usage: predictions <init|audit|check|explain|status> [record.json|directory] [flags]

  init      Scaffold a project policy and a template record. Creates missing files,
            never overwrites without an explicit per-path opt-in.
  audit     Evidence discovery. What a record contains and where it departs from the
            standards. Needs no policy; never produces a verdict.
  check     Policy-aware evaluation. Produces the authoritative verdict for a record
            or a directory of records.
  explain   Why each rule applied or did not, what evidence was found, and what is
            missing. Never changes a verdict.
  status    Aggregate posture of a directory, with framework coverage beside it.

  --policy=<path>   Use this policy instead of searching for one.
  --as-of=<ISO>     Evaluate staleness and expiry against this instant (default: now).
                    Pin it to make a run reproducible.
  --json            Emit the structured report on stdout instead of the readable one.
  --resolution=<path>
                    Write the standardVersion resolution document (E1 existence, E2
                    compatibility, E3 introduction bound) to <path>. Never changes stdout.
                    Not valid with init.
  --strict          audit only: exit 1 when any finding needs attention.
  --dry-run         init only: report what would happen, write nothing.
  --force-overwrite=<path>
                    init only: approve replacing one existing file.

Gate CI on \`check\`. Use \`audit\` for discovery and \`explain\` when a verdict needs
justifying. A verdict of BLOCKED_BY_INVARIANT means stop, not try harder.`;
}

function parseArgs(argv) {
  const options = {
    command: null,
    target: null,
    policy: null,
    asOf: null,
    json: false,
    resolution: null,
    strict: false,
    dryRun: false,
    forceOverwrite: [],
  };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--policy=")) options.policy = arg.slice("--policy=".length);
    else if (arg.startsWith("--as-of=")) options.asOf = arg.slice("--as-of=".length);
    else if (arg.startsWith("--resolution=")) {
      options.resolution = arg.slice("--resolution=".length);
      if (!options.resolution) throw new Error("--resolution needs a path");
    }
    else if (arg.startsWith("--force-overwrite=")) options.forceOverwrite.push(arg.slice("--force-overwrite=".length));
    else if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    else if (options.command === null) options.command = arg;
    else if (options.target === null) options.target = arg;
    else throw new Error(`unexpected argument '${arg}'`);
  }
  if (!options.command) throw new Error("a command is required");
  if (!["init", "audit", "check", "explain", "status"].includes(options.command)) {
    throw new Error(`unknown command '${options.command}'`);
  }
  if (options.resolution !== null && options.command === "init") {
    // `init` resolves no policy version, so there is no document to write. Accepting the flag and
    // exiting 0 would read as "the document was written"; refusing keeps a flag from being a
    // silent no-op. check, explain, status and audit each write it.
    throw new Error("--resolution does not apply to init: init resolves no standardVersion and writes no resolution document");
  }
  if (options.strict && options.command !== "audit") {
    // --strict changes an exit contract, and only audit's is hers to change. Allowing it on check
    // would make the verdict's meaning depend on a flag.
    throw new Error("--strict applies to audit only");
  }
  if (options.asOf !== null) {
    if (!Number.isFinite(Date.parse(options.asOf))) {
      throw new Error(`--as-of='${options.asOf}' is not a parseable instant`);
    }
    // Normalise on accept, at the one point the caller's text enters the program.
    //
    // Everything downstream reads this value two different ways, and only one of them was ever
    // offset-correct. Staleness converts with `ms()`, so it always meant the instant. The evaluation
    // DAY is `asOf.slice(0, 10)`, which means whatever the text happens to say in its first ten
    // characters — so `2026-08-09T23:00:00-05:00` dated a run to 2026-08-09 when the instant is
    // 2026-08-10T04:00Z, and an exception that lapsed that night was honoured after it lapsed. The
    // same text was also echoed into `asOf` and every record's `evaluatedAt`, where
    // schemas/report.schema.json admits only the `Z` form.
    //
    // Converting here fixes both, for every reader at once, instead of at each site that remembers
    // to call `ms()` — and it changes nothing about WHICH invocations are accepted. Rejecting
    // offsets would have been a break to fix something a conversion handles; widening the schema
    // would have silenced the validator and left the day wrong.
    //
    // It runs AFTER the parseability check and not before. `new Date("nonsense").toISOString()`
    // throws a RangeError, which would surface as a crash rather than as the refusal above.
    options.asOf = new Date(options.asOf).toISOString();
  }
  return options;
}

/** Find the policy: an explicit flag, then upward from the record, then this repository's own. */
/**
 * Every project-policy.yml path the search looks at, in order, up to and including the first that
 * exists, whether or not it exists. A file created at an earlier candidate would be discovered by
 * the NEXT run, so those names are inputs of this run even though nothing is there yet.
 * Empty when --policy names the policy explicitly: nothing is searched then.
 */
function policySearchCandidates(options) {
  if (options.policy) return [];
  const candidates = [];
  let dir = path.resolve(options.target ?? ".");
  if (existsSync(dir) && !dir.endsWith(".json")) {
    // walk from the directory itself
  } else {
    dir = path.dirname(dir);
  }
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "project-policy.yml");
    candidates.push(candidate);
    if (existsSync(candidate)) return candidates;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  candidates.push(path.join(ROOT, "project-policy.yml"));
  return candidates;
}

function resolvePolicyPath(options) {
  if (options.policy) return options.policy;
  const found = policySearchCandidates(options).find((c) => existsSync(c));
  return found ?? null;
}

const WINDOWS_DEVICE = /^(con|prn|aux|nul|conin$|conout$|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/**
 * Why `--resolution` may not be WRITTEN at this path, or null. The destination must be a regular
 * file or not exist: a device (`/dev/stdout`, `NUL`), a FIFO, a socket, a directory or a symlink
 * would make the write land somewhere other than a file this run owns — in the worst case in front
 * of the `--json` report on stdout, or blocking forever on a pipe with no reader. Windows device
 * names and `\.\` / `\?\` namespaces are refused by name, since lstat on them is not a reliable
 * test of what the write would reach.
 */
function resolutionDestinationProblem(outPath) {
  let abs;
  try {
    abs = physicalDestination(outPath);
  } catch (error) {
    return `its directory cannot be resolved (${error?.code ?? "error"})`;
  }
  if (process.platform === "win32") {
    const isSep = (c) => c === "/" || c === String.fromCharCode(92);
    const namespaced = (p) => p.length >= 4 && isSep(p[0]) && isSep(p[1]) && (p[2] === "." || p[2] === "?") && isSep(p[3]);
    if (namespaced(outPath) || namespaced(abs)) return "it is in the Windows device namespace";
    const stem = path.basename(abs).split(".")[0].replace(/[ .]+$/, "");
    if (WINDOWS_DEVICE.test(stem)) return "it is a reserved Windows device name";
  }
  let stat;
  try {
    stat = lstatSync(abs);
  } catch (error) {
    return error?.code === "ENOENT" || error?.code === "ENOTDIR" ? null : `it cannot be inspected (${error.code})`;
  }
  if (stat.isSymbolicLink()) return "it is a symbolic link";
  if (!stat.isFile()) return "it exists and is not a regular file (directory, device, FIFO or socket)";
  return null;
}

/**
 * Write by creating a new file beside the destination and renaming it over. Rename replaces the
 * directory entry and never writes through whatever the entry pointed at, so a destination that
 * became a symlink, FIFO or device after validation is replaced rather than followed.
 */
export async function writeResolutionFile(file, text, { tempPath } = {}) {
  const abs = physicalDestination(file);
  const temp = tempPath ?? path.join(path.dirname(abs), `.${path.basename(abs)}.${randomBytes(8).toString("hex")}.tmp`);
  // Only a file THIS call created may be removed. A "wx" open that fails with EEXIST means the name
  // belongs to someone else (a stale or concurrent file); unlinking it would destroy what we do not own.
  let created = false;
  try {
    await writeFile(temp, text, { flag: "wx" });
    created = true;
    await rename(temp, abs);
  } catch (error) {
    if (created) {
      try {
        await unlink(temp);
      } catch {
        // already gone
      }
    }
    throw error;
  }
}

/**
 * Everything a run reads, as a computed list rather than a remembered one: an output that lands on
 * any of these changes the run that produces it, or the next one. Each entry is one line so that a
 * mutant can remove it and a test can name it.
 *
 *   file entries are guarded by equality, directory entries by containment.
 *   The target is guarded as a tree: every .json under it is read as a record.
 */
function readSet({ target, policyPath, policyCandidates = [] }, unenumerable = []) {
  const entries = [
    { p: target, dir: true, why: `the target (${relative(target)}), where every .json is read as a record` },
    { p: policyPath, why: "the policy file" },
    ...policyCandidates.map((c) => ({ p: c, why: `a project-policy.yml the policy search looks at (${relative(c)})` })),
    { p: REGISTER_PATH, why: "the release register" },
    { p: path.join(ROOT, "VERSION"), why: "the pack VERSION file" },
    { p: CATALOG_DIR, dir: true, why: "the rule catalog (rules/), read on every run" },
    { p: RECORD_SCHEMA, why: "the prediction-record schema" },
    { p: POLICY_SCHEMA, why: "the project-policy schema" },
    { p: path.join(ROOT, "scripts"), dir: true, why: "the scripts directory, the code being run" },
  ];
  // A directory is guarded by containment, which does not see a FILE inside it that is a symlink to
  // somewhere else: the run reads the backing file, and a write onto the backing file would replace
  // what the run is about to read. So every file under a guarded directory is also guarded as a
  // file, and path-guard.mjs resolves each through the filesystem to the file actually read.
  // (A hard link needs no such entry: the write is a rename, which replaces the destination's
  // directory entry and never modifies the inode another name points at.)
  const expanded = [];
  for (const entry of entries.filter((e) => e.p)) {
    expanded.push(entry);
    if (!entry.dir) continue;
    const via = entry.why.split(",")[0];
    // loadRecords() uses a recursive readdir, which FOLLOWS directory symlinks (verified on Node 18,
    // 20 and 24: a cycle is walked until the OS refuses). The guard must see what that scan sees, so
    // a symlinked directory is guarded as a directory (anything written under it is read as a
    // record) and walked once by its real path; the visited set is what ends a cycle.
    // Identity (dev:ino), not path strings, so two names for one directory are one directory.
    const identity = (st) => `${st.dev}:${st.ino}`;
    const visited = new Set();
    try {
      visited.add(identity(statSync(entry.p)));
    } catch {
      // handled by the top-level readdir below
    }
    const walk = (dir, top) => {
      let children;
      try {
        children = readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        // A target that is a single file or does not exist has nothing to enumerate. Any other
        // failure (EACCES, ...) means inputs may exist that we could not see; that is reported, not
        // swallowed, and the caller refuses: a guard that silently shrinks is not a guard.
        if (top && (error?.code === "ENOENT" || error?.code === "ENOTDIR")) return;
        unenumerable.push(`${relative(dir)} (${error?.code ?? "error"})`);
        return;
      }
      for (const child of children) {
        const full = path.join(dir, child.name);
        let isDir = child.isDirectory();
        const isLink = child.isSymbolicLink();
        if (isLink) {
          try {
            isDir = statSync(full).isDirectory();
          } catch {
            isDir = false; // dangling: read as a file path, which fails; nothing to walk
          }
        }
        if (isLink && isDir) {
          expanded.push({ p: full, dir: true, why: `a directory symlinked into the inputs (${relative(full)}, reached through ${via}), whose contents are read as records` });
        } else {
          expanded.push({ p: full, why: `a file read by this run (${relative(full)}, reached through ${via})` });
        }
        if (isDir) {
          let real;
          try {
            real = identity(statSync(full));
          } catch (error) {
            unenumerable.push(`${relative(full)} (${error?.code ?? "error"})`);
            continue;
          }
          if (!visited.has(real)) {
            visited.add(real);
            walk(full, false);
          }
        }
      }
    };
    walk(entry.p, true);
  }
  return expanded;
}

/**
 * Why `--resolution` may not name this path, or null. The record scan treats every .json under the
 * target as a prediction record, so a document written there would be evaluated as an extra
 * malformed record, and one written over an input would destroy it before it was read. An output
 * must not land on anything the run reads.
 */
function resolutionPathConflict(outPath, context, options = {}) {
  try {
    const unenumerable = [];
    const entries = readSet(context, unenumerable);
    const hit = firstConflict(outPath, entries, options);
    if (hit) return hit.dir ? `it is inside or equal to ${hit.why}` : `it is ${hit.why}`;
    if (unenumerable.length > 0) {
      return `the inputs of this run cannot be enumerated (${unenumerable.slice(0, 3).join(", ")}), so the output cannot be proven to be outside them`;
    }
    return null;
  } catch (error) {
    return `a path involved cannot be resolved, so the output cannot be proven to be outside the inputs (${error?.code ?? error?.message})`;
  }
}
const relative = (p) => path.relative(ROOT, p).split(path.sep).join("/") || p;

/**
 * Evaluate every record under `target`. Returns the per-record envelopes plus an aggregate.
 * `policy` may be null, in which case every record is NOT_EVALUATED — a missing policy is a
 * configuration fault, never a failing prediction.
 */
async function evaluateAll({ catalog, schema, policy, target, asOf, includeSeries = true }) {
  const loaded = await loadRecords(target);
  if (loaded.length === 0) throw new Error(`no records found at ${target}`);

  const parameters = resolveParameters(policy);
  const seriesFindings = includeSeries
    ? inspectSeries(loaded.filter((entry) => entry.record !== null))
    : new Map();
  const schemaFindings = inspectSchema(schema);

  const reports = [];
  for (const entry of loaded) {
    if (entry.record === null) {
      // A record that could not be read produced no verdict, which is what NOT_EVALUATED means.
      // Carried explicitly so the counts, the human output and the JSON stop giving three answers
      // to one question (ADR 0010).
      reports.push({
        file: entry.file,
        parseError: entry.parseError,
        envelope: null,
        status: STATUS.NOT_EVALUATED,
      });
      continue;
    }
    const findings = [
      ...inspect({ record: entry.record, schema, parameters, asOf }),
      ...(seriesFindings.get(entry.file) ?? []),
      ...schemaFindings,
    ];
    assertBindings(catalog, findings.map((f) => f.rule));

    const verdict = evaluate({
      catalog,
      policy,
      findings,
      evaluated: EVALUATED_RULES,
      today: asOf.slice(0, 10),
      recordApplicability: recordApplicability(entry.record),
      recordNotEvaluated: recordNotEvaluated(entry.record),
    });

    reports.push({
      file: entry.file,
      status: verdict.status,
      envelope: envelope({
        verdict,
        project: policy?.project ?? null,
        standardVersion: policy?.standardVersion ?? null,
        evaluatedAt: asOf,
        asOf,
        record: entry.record.id ?? null,
        parameters,
        frameworkCoverage: coverage(catalog, { evaluated: EVALUATED_RULES, totalStandards: TOTAL_STANDARDS }),
      }),
    });
  }

  const aggregate = {
    supported: 0,
    supportedWithExceptions: 0,
    insufficientlySupported: 0,
    blockedByInvariant: 0,
    notEvaluated: 0,
  };
  const key = {
    [STATUS.SUPPORTED]: "supported",
    [STATUS.SUPPORTED_WITH_EXCEPTIONS]: "supportedWithExceptions",
    [STATUS.INSUFFICIENTLY_SUPPORTED]: "insufficientlySupported",
    [STATUS.BLOCKED_BY_INVARIANT]: "blockedByInvariant",
    [STATUS.NOT_EVALUATED]: "notEvaluated",
  };
  // Counts and verdict fold the same per-record statuses. Deriving them separately is how the two
  // come to disagree.
  for (const report of reports) aggregate[key[report.status]]++;

  return { reports, aggregate, status: aggregateStatus(reports.map((r) => r.status)), parameters };
}

/**
 * Load the policy, or return the reason it could not be loaded. Never a verdict.
 *
 * ADR 0012: this is also where the declared `standardVersion` is resolved, because it must be
 * answered before a record is read and be the same answer for every target. `resolution` is
 * attached here and read by the caller; neither `checkPolicy` nor `evaluate` knows about it. The
 * inputs are the catalog and the register shipped with the pack, never the target.
 */
async function loadPolicy(policyPath, asOf, { catalog, register, registerState, packVersion }) {
  if (!policyPath) {
    return { policy: null, error: "no project-policy.yml was found", resolution: notAttempted("no-policy") };
  }
  let result;
  try {
    result = await checkPolicy(policyPath, POLICY_SCHEMA, asOf.slice(0, 10));
  } catch (cause) {
    // A policy path that is missing, unreadable or a directory rejects here rather than returning
    // "invalid". It is the same class of fault, and is routed the same way: a configuration error
    // (exit 2) and a NOT_ATTEMPTED resolution document, never an uncaught exception.
    const error = `${relative(policyPath)} cannot be read: ${cause?.code ?? cause?.message ?? "error"}`;
    return { policy: null, error, resolution: { ...notAttempted("policy-unreadable", error), policy: relative(policyPath) } };
  }
  if (result.status === "invalid") {
    const error = `${relative(policyPath)} is not valid: ${result.errors.map((e) => `${e.path || "(document)"} ${e.message}`).join("; ")}`;
    return { policy: null, error, resolution: { ...notAttempted("policy-invalid", error), policy: relative(policyPath) } };
  }
  const resolution = {
    ...resolveVersion({ declared: result.document.standardVersion, catalog, register, registerState, packVersion }),
    policy: relative(policyPath),
  };
  // A policy with compliance findings still loads. Those findings are real — an expired exception,
  // an exception against a non-exemptible rule — and the compliance engine reports them against the
  // rules they target rather than refusing to run.
  return { policy: result.document, policyFindings: result.findings, resolution };
}

/**
 * What the top-level `status` claims, and — more importantly — what it does not. Published rather
 * than kept internal because the enforcer's adapter contract has no field to carry it: `result`
 * declares `statuses` and `passing` and nothing else, so this boundary can only travel in our own
 * output and documentation (ADR 0010).
 */
export const AGGREGATE_NOTE =
  "The status above is the strongest disposition observed across the checked set, not a summary of findings. " +
  "No subordinate outcome may be inferred from it in either direction: NOT_EVALUATED does not mean nothing " +
  "adverse was observed, and SUPPORTED does not mean every applicable rule passed — rules nothing evaluated " +
  "are reported as not-evaluated. Read the aggregate counts and the per-record reports for what was found. " +
  "The verdict is valid as of the asOf instant in this report; store it alongside any retained result.";

/** Break a long note into terminal-width lines without splitting words. */
function wrap(text, width = 94) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export const STATUS_NOTE = {
  [STATUS.SUPPORTED]: "Every applicable rule that was evaluated passed. Rules nothing evaluated are listed as not-evaluated, not as passes.",
  [STATUS.SUPPORTED_WITH_EXCEPTIONS]: "Supported only by way of one or more approved exceptions. Each is listed above with its approver and expiry.",
  [STATUS.INSUFFICIENTLY_SUPPORTED]: "At least one applicable rule failed. The prediction is not justified by the evidence it carries.",
  [STATUS.BLOCKED_BY_INVARIANT]: "A non-exemptible rule failed, or the standards system was manipulated to avoid one. This means stop, not try harder. Do not adjust the policy, the thresholds, or the record's declarations to change this verdict.",
  [STATUS.NOT_EVALUATED]: "No verdict was reached. This is a configuration fault, not a statement about the prediction.",
};

function renderReport(report, { verbose = false, verdict = true } = {}) {
  const out = [];
  if (!report.envelope) {
    out.push(`  ${relative(report.file)}`);
    out.push(
      verdict
        ? `    NOT_EVALUATED — the record could not be parsed: ${report.parseError}`
        : `    unreadable — ${report.parseError}`,
    );
    return out;
  }
  const e = report.envelope;
  // `audit` prints no status word and no score. It is evidence discovery, and showing a verdict
  // here would make the two commands interchangeable to anyone reading the output.
  const failed = e.results.filter((r) => r.status === "failed").length;
  out.push(
    verdict
      ? `  ${relative(report.file)}  ${e.status}${e.score === null ? "" : `  (${e.score}%)`}`
      : `  ${relative(report.file)}  ${failed} finding(s)`,
  );

  const failures = e.results.filter((r) => r.status === "failed");
  for (const r of failures) {
    out.push(`    FAIL  ${r.ruleId}`);
    out.push(`          ${r.message}`);
    if (verbose) out.push(`          fix: ${r.remediation}`);
  }
  const warnings = e.results.filter((r) => r.status === "warning");
  for (const r of warnings) out.push(`    warn  ${r.ruleId}: ${r.message}`);

  if (verbose) {
    const notApplicable = e.results.filter((r) => r.disposition === "not-applicable");
    for (const r of notApplicable) out.push(`    n/a   ${r.ruleId}: ${r.message}`);
    const notEvaluated = e.results.filter((r) => r.disposition === "not-evaluated");
    for (const r of notEvaluated) out.push(`    ----  ${r.ruleId}: not evaluated`);
    const attested = e.results.filter((r) => r.disposition === "attested");
    for (const r of attested) out.push(`    att   ${r.ruleId}: ${r.message}`);
    const passed = e.results.filter((r) => r.status === "passed" && r.disposition === "evaluated");
    for (const r of passed) out.push(`    ok    ${r.ruleId}`);
  }
  return out;
}

/**
 * Assurance totals over a run.
 *
 * Assurance is a PER-RECORD quantity: an abstention answers fewer rules than a prediction, and a
 * record at record schema 1.0.0 leaves `falsifiability.declared` not-evaluated where a 1.1.0 record
 * answers it. So a directory run has no single record whose assurance describes it, and the earlier
 * version of this function took the first record's figures and printed them as though it did — which
 * could contradict the per-record results printed directly above, in exactly the heterogeneous
 * directory where a reader most needs them.
 *
 * These are summed rule outcomes across the run, labelled as such. Framework coverage is not summed:
 * it is a property of the catalog and the evaluator, identical for every record.
 */
function sumAssurance(envelopes) {
  const total = { automated: 0, manualReview: 0, notEvaluated: 0 };
  for (const e of envelopes) {
    for (const key of Object.keys(total)) total[key] += e.assurance?.[key] ?? 0;
  }
  return total;
}

function renderAssurance(envelopes) {
  const list = Array.isArray(envelopes) ? envelopes : [envelopes];
  const a = sumAssurance(list);
  const c = list[0].frameworkCoverage;
  const scope = list.length === 1 ? "" : ` (rule outcomes across ${list.length} records)`;
  const out = [
    `  Assurance:  ${a.automated} automated, ${a.manualReview} human-reviewed, ${a.notEvaluated} not evaluated${scope}`,
    `  Coverage:   ${c.evaluatedRules}/${c.cataloguedRules} rules have a detector; ${c.fullyMachineRepresentedStandards}/${c.standards} standards fully machine-represented`,
  ];
  // Say so when the run is mixed, rather than leaving a reader to divide by the record count and
  // assume the records are alike. They routinely are not.
  const profiles = new Set(list.map((e) => `${e.assurance?.automated}/${e.assurance?.manualReview}/${e.assurance?.notEvaluated}`));
  if (profiles.size > 1) {
    out.push(`  Records differ in what could be evaluated (${profiles.size} distinct profiles); see each record above.`);
  }
  out.push("  Coverage is framework maturity, reported beside the verdict and never combined with it.");
  out.push("  A verdict speaks only about the rules that were evaluated.");
  return out;
}

/**
 * Leave with a status, without discarding what was written.
 *
 * `process.exit()` terminates immediately, and a write to a pipe is not necessarily complete when it
 * returns — on Linux a large `--json` report is delivered in chunks, so exiting on the next line
 * truncates it mid-string. `check --json` over a few dozen records is well past that threshold, and
 * the failure is silent in the worst way: the consumer receives a well-formed prefix of a real
 * report and a parse error from a document nobody corrupted.
 *
 * It stayed hidden because a Windows console flushes synchronously, so the suite was green on the
 * machine it was written on and truncated in the container the pipeline runs in. Setting `exitCode`
 * and returning asks for the same exit status and lets Node drain stdout first, which is the
 * difference between an exit code and an amputation.
 *
 * Every caller RETURNS through this. The old calls did not return because they could not be reached
 * past `process.exit`; that is no longer true, and a missing `return` here would carry on running
 * after the run had decided it was over.
 */
function exitWith(code) {
  process.exitCode = code;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`predictions: ${error.message}\n\n${usage()}\n`);
    return exitWith(EXIT_INVOCATION);
  }

  if (options.command === "init") {
    const { runInit } = await import("./init.mjs");
    return runInit(options);
  }

  const asOf = options.asOf ?? new Date().toISOString();
  const target = options.target ?? path.join(ROOT, "examples/records");

  let catalog;
  let schema;
  try {
    catalog = await loadCatalog();
    schema = JSON.parse(await readFile(RECORD_SCHEMA, "utf8"));
  } catch (error) {
    const detail = error instanceof CatalogError ? `catalog: ${error.message}` : error.message;
    process.stderr.write(`predictions: ${detail}\n`);
    return exitWith(EXIT_INVOCATION);
  }

  const policyPath = resolvePolicyPath(options);

  // Refused before anything is written or read: an output that lands in the input tree changes the
  // very run that produces it. Exit 2 is an invocation error, the same class as an unknown flag.
  if (options.resolution) {
    const conflict = resolutionPathConflict(options.resolution, { target, policyPath, policyCandidates: policySearchCandidates(options) });
    const problem = conflict ?? resolutionDestinationProblem(options.resolution);
    if (problem) {
      process.stderr.write(`predictions ${options.command}: --resolution=${options.resolution} refused: ${problem}. Nothing was written.
`);
      return exitWith(EXIT_INVOCATION);
    }
  }
  const { register, state: registerState } = await readRegister();
  let packVersion = null;
  try {
    packVersion = (await readFile(path.join(ROOT, "VERSION"), "utf8")).trim();
  } catch {
    // E3 reports an unreadable pack version as its own reason; it is not a crash here.
  }
  const { policy, error: policyError, resolution } = await loadPolicy(policyPath, asOf, {
    catalog,
    register,
    registerState,
    packVersion,
  });

  // The resolution document is written before anything can exit, so a failed run still leaves it.
  // It goes to a path the caller named and never to stdout: `check --json` stdout is parsed by the
  // enforcer's adapter and stays byte-identical whether or not this flag is given.
  if (options.resolution) {
    try {
      await writeResolutionFile(options.resolution, JSON.stringify(resolution, null, 2) + "\n");
    } catch (error) {
      process.stderr.write(`predictions ${options.command}: cannot write --resolution file: ${error.message}\n`);
      return exitWith(EXIT_INVOCATION);
    }
  }

  // `audit` produces no verdict, so it needs no policy — but it does need the project's thresholds,
  // because a disagreement threshold or a confidence vocabulary is an input to *observing* anything
  // at all. Without them it would report a record using the project vocabulary as having an
  // undefined confidence tier, which is a fact about the missing policy rather than about the
  // record. So audit reads `parameters` and nothing else: no applicability, no exceptions, no
  // attestations, and no verdict. A missing or invalid policy leaves it on documented defaults
  // rather than stopping it.
  const auditing = options.command === "audit";
  const effectivePolicy = auditing ? (policy ? { parameters: policy.parameters } : null) : policy;

  if (!auditing && policyError) {
    process.stderr.write(`predictions ${options.command}: ${policyError}\n`);
    process.stderr.write("A policy that cannot be read is a configuration fault, not a failing prediction.\n");
    return exitWith(EXIT_INVOCATION);
  }

  // An unresolvable declared version is a configuration fault, never a compliance failure
  // (ADR 0012 D6): NOT_EVALUATED, exit 2, before any record is read, with no report on stdout.
  if (!auditing && resolution.attempted && !resolution.resolved) {
    process.stderr.write(`predictions ${options.command}: NOT_EVALUATED: ${describeFailure(resolution)}\n`);
    process.stderr.write(
      "A declared version that cannot be resolved is a configuration fault, not a failing prediction. No record was read.\n",
    );
    return exitWith(EXIT_INVOCATION);
  }

  // `audit` keeps its established exit codes under a resolution fault (0, even with --strict: a
  // missing or unresolvable policy never stopped it). Silence would then read as success, so the
  // fault is carried in words here and in the --resolution document. A run with no policy at all
  // is not announced: there was no declaration to resolve.
  const auditResolutionNote =
    auditing && (resolution.attempted ? !resolution.resolved : ["policy-invalid", "policy-unreadable"].includes(resolution.reason))
      ? describeFailure(resolution)
      : null;
  if (auditResolutionNote) {
    process.stderr.write(
      `predictions audit: ${auditResolutionNote}. audit's exit status is unchanged and does NOT mean the version resolved.\n`,
    );
  }

  let evaluation;
  try {
    evaluation = await evaluateAll({ catalog, schema, policy: effectivePolicy, target, asOf });
  } catch (error) {
    process.stderr.write(`predictions ${options.command}: ${error.message}\n`);
    return exitWith(EXIT_INVOCATION);
  }

  const { reports, aggregate, status, parameters } = evaluation;

  if (options.json) {
    // `check` alone publishes the authoritative disposition. `audit`, `explain` and `status` share
    // this builder and reach no verdict (ADR 0007), so the omission is active rather than
    // incidental — and is asserted as an absence in test/aggregate.test.mjs.
    const verdictBearing = options.command === "check";
    process.stdout.write(
      JSON.stringify(
        {
          schemaVersion: REPORT_SCHEMA_VERSION,
          command: options.command,
          policy: policyPath ? relative(policyPath) : null,
          asOf,
          parameters,
          ...(verdictBearing ? { status } : {}),
          records: reports.map((r) => ({
            file: relative(r.file),
            parseError: r.parseError ?? null,
            // A record that could not be parsed has no envelope, and still has a status.
            ...(r.envelope ?? { status: r.status }),
          })),
          aggregate,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    const out = [];
    const heading = {
      audit: "Audit — evidence only, no verdict",
      check: "Check — is each prediction sufficiently supported?",
      explain: "Explain — why each rule applied, and what was found",
      status: "Status — aggregate posture",
    }[options.command];
    out.push(heading, "");
    out.push(`  Records:    ${reports.length} under ${relative(target)}`);
    if (auditing) {
      out.push(
        policy
          ? `  Thresholds: from ${relative(policyPath)} (audit reads parameters only, and reaches no verdict)`
          : "  Thresholds: evaluator defaults (no policy found; audit reaches no verdict regardless)",
      );
      if (auditResolutionNote) out.push(`  Version:    ${auditResolutionNote} (this exit status does not mean it resolved)`);
    } else if (policyPath) {
      out.push(`  Policy:     ${relative(policyPath)}`);
    }
    out.push(`  As of:      ${asOf}`);
    out.push("");

    if (options.command !== "status") {
      for (const report of reports) {
        out.push(...renderReport(report, { verbose: options.command === "explain", verdict: !auditing }));
        out.push("");
      }
    }

    if (options.command === "audit") {
      const total = reports.reduce(
        (n, r) => n + (r.envelope?.results.filter((x) => x.status === "failed").length ?? 0),
        0,
      );
      out.push(`  ${total} finding(s) across ${reports.length} record(s).`);
      out.push("  This is a survey, not a verdict. Run `check` for the authoritative result.");
    } else {
      if (options.command === "check") {
        // The verdict first, then the counts it does not summarise, then the boundary between them.
        out.push(`  Status:     ${status}`);
      }
      out.push("  " + Object.entries(aggregate).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", "));
      const envelopes = reports.map((r) => r.envelope).filter(Boolean);
      if (envelopes.length > 0) {
        out.push("");
        out.push(...renderAssurance(envelopes));
      }
      // Reported whenever a record is blocked, including when the aggregate is NOT_EVALUATED and
      // therefore does not name it — the counts are not the only place that finding should surface.
      const worst = reports.map((r) => r.status);
      if (worst.includes(STATUS.BLOCKED_BY_INVARIANT)) {
        out.push("");
        out.push(`  ${STATUS_NOTE[STATUS.BLOCKED_BY_INVARIANT]}`);
      }
      if (options.command === "check") {
        out.push("");
        for (const line of wrap(AGGREGATE_NOTE)) out.push(`  ${line}`);
      }
    }
    process.stdout.write(out.join("\n") + "\n");
  }

  if (options.command === "audit") {
    if (!options.strict) return exitWith(EXIT_OK);
    const any = reports.some((r) => !r.envelope || r.envelope.results.some((x) => x.status === "failed"));
    return exitWith(any ? EXIT_FINDINGS : EXIT_OK);
  }

  if (options.command === "explain" || options.command === "status") {
    // Neither produces a verdict, so neither fails on one. They exit 2 only on configuration
    // faults, which were handled above.
    return exitWith(aggregate.notEvaluated > 0 ? EXIT_INVOCATION : EXIT_OK);
  }

  if (aggregate.notEvaluated > 0) return exitWith(EXIT_INVOCATION);
  const bad = aggregate.insufficientlySupported + aggregate.blockedByInvariant;
  return exitWith(bad > 0 ? EXIT_FINDINGS : EXIT_OK);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
