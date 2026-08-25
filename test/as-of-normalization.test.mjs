/**
 * `--as-of` is normalised on accept, and both invariants that depend on it.
 *
 * WHAT WENT WRONG. `parseArgs` admitted any instant `Date.parse` understands, then carried the
 * caller's TEXT through to evaluation and output unchanged. Two separate defects followed from that
 * one decision, and they are not the same bug wearing two hats:
 *
 *   1. THE PUBLISHED CONTRACT WAS VIOLATED BY AN ACCEPTED INVOCATION. `schemas/report.schema.json`
 *      pins instants to the `Z` form. `--as-of=2026-08-09T12:00:00+00:00` is accepted, echoed
 *      verbatim into `asOf` and every record's `evaluatedAt`/`asOf`, and the resulting report fails
 *      the schema that same release publishes. A tool that can be driven into breaking its own
 *      contract, through a door it holds open, has not got a contract yet.
 *
 *   2. A VERDICT COULD DEPEND ON HOW AN INSTANT WAS SPELLED. Record-level staleness uses `ms()` and
 *      was always offset-correct. But the evaluation DAY is taken positionally — `asOf.slice(0, 10)`
 *      — and fed to exception and attestation expiry, which compare ISO dates as strings. On
 *      `2026-08-09T23:00:00-05:00` that slice yields 2026-08-09 while the instant is really
 *      2026-08-10T04:00Z. An exception lapsing that night would be honoured for a run that happened
 *      after it lapsed. This one predates the schema entirely; publishing the schema is only what
 *      made it visible.
 *
 * Normalising on accept — `new Date(value).toISOString()` — closes both at the single point where
 * the text enters, and closes them for every downstream reader at once rather than at each site
 * that remembers to call `ms()`. It also leaves the accepted input set exactly as it was: the
 * alternatives were to reject offsets (a break, to fix something a conversion handles) or to widen
 * the schema (which would silence the validator and leave defect 2 untouched).
 *
 * WHY THE DAY IS MEASURED AND NOT ASSUMED. Asserting the emitted `asOf` only proves what the tool
 * PRINTED. The second test therefore reads a verdict whose value differs between the two candidate
 * days, so it fails if the timestamp is normalised for display while the day is still sliced from
 * the caller's text — the exact half-fix this defect invites.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validate, assertSchemaSupported } from "../scripts/jsonschema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/predictions.mjs");

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas/report.schema.json"), "utf8"));

/** The fixture whose single exception lapses at the end of 2026-08-09. See the file's own comment. */
const POLICY = "test/fixtures/policies/exception-expiring-on-a-boundary.yml";
const TARGET = "test/fixtures/records/unreadable-and-blocked";

/**
 * `check` exits non-zero whenever the verdict is not SUPPORTED, and this fixture's verdict never is
 * — it contains an unreadable record on purpose. So a non-zero exit is the expected path here and
 * its stdout is the report. `ENOBUFS` is rethrown rather than parsed: on a truncated buffer the
 * error still carries a partial stdout, and parsing that would fail somewhere unrelated.
 */
function check(asOf) {
  try {
    return JSON.parse(
      execFileSync(process.execPath, [CLI, "check", TARGET, `--policy=${POLICY}`, `--as-of=${asOf}`, "--json"], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  } catch (error) {
    if (error.code === "ENOBUFS" || typeof error.stdout !== "string") throw error;
    return JSON.parse(error.stdout);
  }
}

/** The one readable record in the fixture — the only entry carrying a summary to compare. */
const readable = (report) => report.records.find((entry) => entry.parseError === null);

test("the schema this suite validates against uses only supported keywords", () => {
  assertSchemaSupported(schema);
});

test("an accepted +00:00 instant is emitted in canonical Z form", () => {
  const report = check("2026-08-09T12:00:00+00:00");
  assert.equal(report.asOf, "2026-08-09T12:00:00.000Z");
  for (const entry of report.records.filter((r) => r.parseError === null)) {
    assert.equal(entry.evaluatedAt, report.asOf, "a record's evaluatedAt disagrees with the report");
    assert.equal(entry.asOf, report.asOf, "a record's asOf disagrees with the report");
  }
});

test("a report produced from an offset-bearing invocation satisfies the published schema", () => {
  // The failure this reproduces: every instant in the document is the caller's text, and the
  // schema's `instant` pattern admits only `Z`. Validating the whole document rather than the
  // top-level field is deliberate — the defect reached the nested timestamps too.
  assert.deepEqual(validate(check("2026-08-09T12:00:00+00:00"), schema), []);
});

test("a negative offset crossing UTC midnight resolves to the next UTC day", () => {
  // 2026-08-09T23:00:00-05:00 IS 2026-08-10T04:00Z. Slicing the caller's text yields 2026-08-09,
  // which is the wrong day and the reason this test reads a verdict rather than a timestamp.
  const crossing = check("2026-08-09T23:00:00-05:00");
  assert.equal(crossing.asOf, "2026-08-10T04:00:00.000Z");

  const expired = check("2026-08-10T04:00:00Z");
  const active = check("2026-08-09T12:00:00Z");

  // The fixture makes the day observable. If these two were equal the test would prove nothing, so
  // the difference is asserted before it is relied on.
  assert.notDeepEqual(
    readable(expired).summary,
    readable(active).summary,
    "the fixture no longer makes the evaluation day observable, so this test cannot detect the defect",
  );

  assert.deepEqual(
    readable(crossing).summary,
    readable(expired).summary,
    "the exception was honoured for a run that happened after it lapsed — the day came from the text",
  );
});

test("equivalent instants spelled differently produce identical reports", () => {
  // Same moment, three spellings. Everything in the envelope is derived from `asOf`, so equality of
  // the WHOLE document is the honest assertion: any field that still carried the caller's text
  // would surface here even if this test never named it.
  const canonical = check("2026-08-10T04:00:00Z");
  for (const spelling of ["2026-08-09T23:00:00-05:00", "2026-08-10T06:00:00+02:00"]) {
    assert.deepEqual(check(spelling), canonical, `${spelling} did not evaluate as the same instant`);
  }
});

test("an unparseable instant is still refused rather than normalised into something plausible", () => {
  // The control. Normalisation must not become acceptance: `new Date("not-a-date").toISOString()`
  // throws, and a nearby mistake — normalising before validating, or catching that throw — would
  // turn a refusal into an Invalid Date or a silent fallback to now. Either would date a run wrongly
  // while looking well-formed, which is worse than the defect being fixed.
  assert.throws(
    () =>
      execFileSync(process.execPath, [CLI, "check", TARGET, "--as-of=not-an-instant", "--json"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: "pipe",
      }),
    (error) => {
      assert.match(String(error.stderr), /not a parseable instant/u);
      return true;
    },
  );
});
