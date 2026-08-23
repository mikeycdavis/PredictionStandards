/**
 * The aggregate status: one authoritative disposition over a checked set (ADR 0010).
 *
 * The question this answers is narrow, and the narrowness is the point. `aggregateStatus` is a fold
 * over per-record statuses and NOTHING else — not rule results, not the counts, not the score. A
 * second path to the verdict is a second evaluator, and two evaluators drift.
 *
 * The ordering is the part that is easy to get wrong, and the obvious ordering is wrong:
 *
 *     NOT_EVALUATED > BLOCKED_BY_INVARIANT > INSUFFICIENTLY_SUPPORTED
 *                   > SUPPORTED_WITH_EXCEPTIONS > SUPPORTED
 *
 * NOT_EVALUATED leads because it is not a milder verdict than blocked — it is the absence of a
 * verdict. INSUFFICIENTLY_SUPPORTED and BLOCKED_BY_INVARIANT are findings; NOT_EVALUATED says no
 * finding was established. Publishing a finding over records the evaluator never reached is the
 * false green in its unflattering direction, and it is still a fabrication. The pack already said
 * this twice before this file existed — compliance.mjs:481 puts `!policy` first, and
 * predictions.mjs:468 tests notEvaluated ahead of blocked and routes it to exit 2, not exit 1.
 *
 * Consequence accepted deliberately: five blocked records plus one unreadable one aggregates to
 * NOT_EVALUATED. The blocked count stays in `aggregate.blockedByInvariant`. The top-level status
 * answers a different question from the counts, and is not a summary of findings.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateStatus, AGGREGATE_PRECEDENCE, STATUS } from "../scripts/compliance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/predictions.mjs");
const AS_OF = "2026-08-09T12:00:00Z";

/** Worst first. The order under test, written out rather than imported, so a reordering of the
 *  implementation's own constant cannot silently redefine what these tests check. */
const WORST_FIRST = [
  STATUS.NOT_EVALUATED,
  STATUS.BLOCKED_BY_INVARIANT,
  STATUS.INSUFFICIENTLY_SUPPORTED,
  STATUS.SUPPORTED_WITH_EXCEPTIONS,
  STATUS.SUPPORTED,
];

const rank = (status) => WORST_FIRST.indexOf(status);

/**
 * The catch arm returns the error's stdout, which is correct for a non-zero exit and dangerous for
 * anything else: `ENOBUFS` also arrives as an error carrying a TRUNCATED stdout, and handing that
 * back would let a prefix of a report be parsed as the report. So the limit is raised past anything
 * this suite produces, and a buffer overrun is rethrown rather than read.
 *
 * This is not what truncated the reports that sent this file red in the container — that was
 * `process.exit` discarding an unflushed pipe, fixed in scripts/predictions.mjs. It is the same
 * failure shape one layer up, and it was left closed rather than left as the next thing to find.
 */
function run(args, { expectExit } = {}) {
  const options = { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], options);
    if (expectExit !== undefined) assert.equal(0, expectExit, `expected exit ${expectExit}, got 0`);
    return { stdout, status: 0 };
  } catch (error) {
    if (error.code === "ENOBUFS") throw error;
    if (expectExit !== undefined) assert.equal(error.status, expectExit);
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", status: error.status };
  }
}

// ---------------------------------------------------------------------------
// 1. The aggregate function
// ---------------------------------------------------------------------------

test("the precedence is exactly the five statuses, worst first", () => {
  assert.deepEqual(AGGREGATE_PRECEDENCE, WORST_FIRST);
  assert.equal(new Set(AGGREGATE_PRECEDENCE).size, 5, "no duplicates, and none missing");
});

test("a uniform set aggregates to its own status", () => {
  for (const status of WORST_FIRST) {
    assert.equal(aggregateStatus([status]), status);
    assert.equal(aggregateStatus([status, status, status]), status);
  }
});

test("every ordered pair aggregates to the worse of the two — all 25", () => {
  // Exhaustive rather than sampled. A sampled version of this passed against an implementation
  // that had two of the five transposed.
  let checked = 0;
  for (const a of WORST_FIRST) {
    for (const b of WORST_FIRST) {
      const expected = rank(a) < rank(b) ? a : b;
      assert.equal(aggregateStatus([a, b]), expected, `{${a}, ${b}}`);
      checked++;
    }
  }
  assert.equal(checked, 25, "all five-by-five pairs must be exercised");
});

test("NOT_EVALUATED dominates BLOCKED_BY_INVARIANT — the decision of ADR 0010", () => {
  // Stated as its own test rather than left inside the 25 pairs, because it is the one place the
  // obvious ordering and the correct one disagree. If this is ever flipped, it should be flipped
  // by deleting a test that says what it is doing.
  assert.equal(
    aggregateStatus([STATUS.BLOCKED_BY_INVARIANT, STATUS.NOT_EVALUATED]),
    STATUS.NOT_EVALUATED,
  );
  assert.equal(
    aggregateStatus([STATUS.NOT_EVALUATED, STATUS.BLOCKED_BY_INVARIANT]),
    STATUS.NOT_EVALUATED,
  );
});

test("I1 — deterministic and order-independent", () => {
  const set = [
    STATUS.SUPPORTED,
    STATUS.BLOCKED_BY_INVARIANT,
    STATUS.SUPPORTED_WITH_EXCEPTIONS,
    STATUS.INSUFFICIENTLY_SUPPORTED,
  ];
  const expected = STATUS.BLOCKED_BY_INVARIANT;

  assert.equal(aggregateStatus(set), expected);
  assert.equal(aggregateStatus([...set].reverse()), expected);
  // Every rotation, and repeated evaluation of the same input.
  for (let i = 0; i < set.length; i++) {
    assert.equal(aggregateStatus([...set.slice(i), ...set.slice(0, i)]), expected);
  }
  assert.equal(aggregateStatus(set), aggregateStatus(set));
});

test("I1 — the mixed NOT_EVALUATED case, which the CLI cannot currently produce", () => {
  // Policy resolution is per-run (predictions.mjs:126), so today `!policy` makes EVERY record
  // NOT_EVALUATED and the mixed case is unreachable through that path. It becomes reachable the
  // moment policy resolves per record, or a record-level not-evaluated disposition is added. The
  // ordering has to already be right when that happens, so the case is constructed here rather
  // than waited for.
  assert.equal(
    aggregateStatus([STATUS.SUPPORTED, STATUS.NOT_EVALUATED, STATUS.SUPPORTED]),
    STATUS.NOT_EVALUATED,
  );
});

test("I2 — adding a record can never improve the aggregate, over all 25 pairs", () => {
  for (const before of WORST_FIRST) {
    for (const added of WORST_FIRST) {
      const after = aggregateStatus([before, added]);
      assert.ok(
        rank(after) <= rank(before),
        `adding ${added} to ${before} improved it to ${after}`,
      );
    }
  }
});

test("I3 — removing the dominant records reveals the next disposition, not a recomputation", () => {
  const set = [
    STATUS.NOT_EVALUATED,
    STATUS.BLOCKED_BY_INVARIANT,
    STATUS.SUPPORTED,
    STATUS.SUPPORTED,
    STATUS.SUPPORTED,
  ];
  assert.equal(aggregateStatus(set), STATUS.NOT_EVALUATED);

  const withoutUnknown = set.filter((s) => s !== STATUS.NOT_EVALUATED);
  assert.equal(aggregateStatus(withoutUnknown), STATUS.BLOCKED_BY_INVARIANT);

  const withoutBlocked = withoutUnknown.filter((s) => s !== STATUS.BLOCKED_BY_INVARIANT);
  // Three supported records out of an original five. Any score- or ratio-derived value could land
  // anywhere; the next status actually present is SUPPORTED.
  assert.equal(aggregateStatus(withoutBlocked), STATUS.SUPPORTED);
});

test("I3 — one exception among many supported records survives to the aggregate", () => {
  const set = [...Array(99).fill(STATUS.SUPPORTED), STATUS.SUPPORTED_WITH_EXCEPTIONS];
  assert.equal(aggregateStatus(set), STATUS.SUPPORTED_WITH_EXCEPTIONS);
  // And removing it reveals the next, rather than a majority-derived SUPPORTED all along.
  assert.equal(aggregateStatus(set.slice(0, 99)), STATUS.SUPPORTED);
});

test("I4 — an empty set has no aggregate status, and asking is an error", () => {
  assert.throws(() => aggregateStatus([]), /at least one record/i);
});

test("an unrecognised status fails closed rather than being treated as not-passing", () => {
  // The enforcer's own contract makes this distinction: an unrecognised status and a non-passing
  // status are different problems. Guessing here would hide the first as the second.
  assert.throws(() => aggregateStatus(["COMPLIANT"]), /unknown record status/i);
  assert.throws(() => aggregateStatus([STATUS.SUPPORTED, "MOSTLY_FINE"]), /unknown record status/i);
});

// ---------------------------------------------------------------------------
// 2. Parse-error normalisation
// ---------------------------------------------------------------------------

const MIXED = "test/fixtures/records/unreadable-and-blocked";

test("the fixture really is one unreadable record and one blocked record", () => {
  // Asserted, not assumed: if the fixture stops having those two shapes the rest proves nothing.
  const { stdout } = run(["check", MIXED, `--as-of=${AS_OF}`, "--json"], { expectExit: 2 });
  const json = JSON.parse(stdout);
  assert.equal(json.records.length, 2);

  const unreadable = json.records.find((r) => r.parseError);
  const blocked = json.records.find((r) => !r.parseError);
  assert.ok(unreadable, "one record must fail to parse");
  assert.equal(blocked.status, STATUS.BLOCKED_BY_INVARIANT);
  assert.ok(blocked.blockedBy.length > 0, "and it must name what blocked it");
});

test("an unreadable record carries status NOT_EVALUATED in the JSON, not just in the counts", () => {
  // The interface hole this closes: the counts said notEvaluated (predictions.mjs:214), the text
  // renderer printed NOT_EVALUATED (:253), and the JSON record carried no status at all (:397).
  // Three answers to one question. This ratifies the two that already agreed.
  const { stdout } = run(["check", MIXED, `--as-of=${AS_OF}`, "--json"], { expectExit: 2 });
  const json = JSON.parse(stdout);
  const unreadable = json.records.find((r) => r.parseError);

  assert.equal(unreadable.status, STATUS.NOT_EVALUATED);
  assert.ok(unreadable.parseError, "and it keeps the reason it could not be read");
});

test("every record in the JSON carries a status, whatever its shape", () => {
  const { stdout } = run(["check", MIXED, `--as-of=${AS_OF}`, "--json"], { expectExit: 2 });
  const json = JSON.parse(stdout);
  for (const record of json.records) {
    assert.ok(
      AGGREGATE_PRECEDENCE.includes(record.status),
      `${record.file} has status ${JSON.stringify(record.status)}`,
    );
  }
});

test("counts, text and JSON agree about the unreadable record", () => {
  const { stdout: jsonOut } = run(["check", MIXED, `--as-of=${AS_OF}`, "--json"], { expectExit: 2 });
  const { stdout: textOut } = run(["check", MIXED, `--as-of=${AS_OF}`], { expectExit: 2 });
  const json = JSON.parse(jsonOut);

  const fromRecords = json.records.filter((r) => r.status === STATUS.NOT_EVALUATED).length;
  assert.equal(json.aggregate.notEvaluated, fromRecords, "counts must fold the same statuses");
  assert.equal(fromRecords, 1);
  assert.match(textOut, /NOT_EVALUATED/, "and the human output must say the same word");
});

test("F2 — one unreadable record plus a blocked record aggregates to NOT_EVALUATED", () => {
  // The uncomfortable case, accepted deliberately. The set cannot carry a complete domain
  // disposition, so it does not claim one.
  const { stdout } = run(["check", MIXED, `--as-of=${AS_OF}`, "--json"], { expectExit: 2 });
  const json = JSON.parse(stdout);
  assert.equal(json.status, STATUS.NOT_EVALUATED);
});

test("F2 — and the blocked finding stays visible in the counts", () => {
  // The whole defence of the ordering. If this ever fails, the aggregate really is masking, and
  // the ADR's reasoning collapses with it.
  const { stdout } = run(["check", MIXED, `--as-of=${AS_OF}`, "--json"], { expectExit: 2 });
  const json = JSON.parse(stdout);
  assert.equal(json.aggregate.blockedByInvariant, 1);
  assert.equal(json.records.find((r) => !r.parseError).status, STATUS.BLOCKED_BY_INVARIANT);
});

// ---------------------------------------------------------------------------
// 3. Command boundaries
// ---------------------------------------------------------------------------

const CLEAN = "test/fixtures/records/falsifiability";

test("check --json publishes a top-level status", () => {
  const { stdout } = run(["check", CLEAN, `--as-of=${AS_OF}`, "--json"], { expectExit: 1 });
  const json = JSON.parse(stdout);
  assert.ok("status" in json, "check is the adapter entrypoint and must publish the verdict");
  assert.equal(json.status, STATUS.INSUFFICIENTLY_SUPPORTED);
});

test("the top-level status is a fold over the per-record statuses, and a consumer can verify it", () => {
  // Recomputable from `records[].status` alone, with no access to our internals. This is what
  // makes it one semantic source of truth rather than a second evaluator.
  for (const dir of [CLEAN, MIXED, "test/fixtures/records/mixed-assurance"]) {
    const { stdout } = run(["check", dir, `--as-of=${AS_OF}`, "--json"]);
    const json = JSON.parse(stdout);
    assert.equal(json.status, aggregateStatus(json.records.map((r) => r.status)), dir);
  }
});

test("status --json does not publish a top-level status key", () => {
  // ADR 0007 records `status` as reaching no verdict, and it shares the envelope builder with
  // `check`. The omission is therefore active, and asserted as an absence.
  const { stdout } = run(["status", CLEAN, `--as-of=${AS_OF}`, "--json"]);
  const json = JSON.parse(stdout);
  assert.equal("status" in json, false, "the status COMMAND must not emit the status KEY");
});

test("explain --json does not publish a top-level status key", () => {
  const { stdout } = run(["explain", CLEAN, `--as-of=${AS_OF}`, "--json"]);
  const json = JSON.parse(stdout);
  assert.equal("status" in json, false);
});

test("audit --json does not publish a top-level status key", () => {
  const { stdout } = run(["audit", CLEAN, `--as-of=${AS_OF}`, "--json"]);
  const json = JSON.parse(stdout);
  assert.equal("status" in json, false, "audit reaches no verdict by design (ADR 0007)");
});

test("I4 — an empty target fails before any status-bearing envelope exists", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "prediction-empty-"));
  try {
    const result = run(["check", dir, `--as-of=${AS_OF}`, "--json"], { expectExit: 2 });
    assert.equal(result.stdout.trim(), "", "no JSON at all, so no status to misread");
    assert.match(result.stderr, /no records found/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a configuration fault never manufactures a domain verdict", () => {
  // The boundary from ADR 0010 question 6: command-level failures do not override the status,
  // they prevent it existing.
  const unknownFlag = run(["check", CLEAN, "--nonsense"], { expectExit: 2 });
  assert.equal(unknownFlag.stdout.trim(), "");

  const badAsOf = run(["check", CLEAN, "--as-of=not-a-date", "--json"], { expectExit: 2 });
  assert.equal(badAsOf.stdout.trim(), "");
});

// ---------------------------------------------------------------------------
// 4. The published assurance boundary
// ---------------------------------------------------------------------------

test("the envelope carries the asOf its verdict is valid as of", () => {
  // The status is a function of (tree, asOf), not of the tree alone: exception expiry
  // (compliance.mjs:106) and attestation expiry (:389) compare against a clock. A consumer
  // memoising "SUPPORTED at <sha>" would be wrong the day an exception lapses, so the instant the
  // verdict was reached has to travel with it.
  const { stdout } = run(["check", CLEAN, `--as-of=${AS_OF}`, "--json"], { expectExit: 1 });
  const json = JSON.parse(stdout);
  assert.equal(json.asOf, AS_OF);
  assert.ok("status" in json && "asOf" in json, "a retained verdict needs both");
});

test("the note published beside the aggregate says it is not a summary of findings", async () => {
  const { STATUS_NOTE, AGGREGATE_NOTE } = await import("../scripts/predictions.mjs");
  assert.ok(AGGREGATE_NOTE, "the aggregate needs its own note; the per-record notes do not cover it");
  assert.match(AGGREGATE_NOTE, /not a summary/i);
  assert.match(AGGREGATE_NOTE, /aggregate|counts/i, "it must point the reader at the counts");
  assert.ok(STATUS_NOTE, "and the per-record notes remain");
});

test("the documentation states the boundary next to the field", async () => {
  // A consumer integrating against the adapter contract may never read the ADR, and the enforcer's
  // contract has no field to carry this. Published docs are the only transport.
  const { readFile } = await import("node:fs/promises");
  const docs = await readFile(path.join(ROOT, "docs/json-output.md"), "utf8");

  // Matched across line breaks: the prose is wrapped for reading, and a claim should not have to
  // sit on one line to count as published.
  const prose = docs.replace(/\s+/g, " ");

  assert.match(prose, /not a summary of findings/i);
  assert.match(prose, /asOf/, "retained verdicts require the instant they were valid as of");
  assert.match(prose, /NOT_EVALUATED/);
  assert.match(
    prose,
    /does not (imply|mean) (that )?every applicable rule passed/i,
    "SUPPORTED does not imply every applicable rule passed — rules nothing evaluated are skipped",
  );
  assert.match(prose, /as of time T|as of an instant/i, "and the verdict is time-bound, not commit-bound");
});
