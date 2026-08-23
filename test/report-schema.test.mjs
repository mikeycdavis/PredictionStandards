/**
 * The report envelope, checked against the schema that defines it (ADR 0011).
 *
 * ADR 0011 says the envelope's `schemaVersion` promises that every DOCUMENTED key is present with
 * its documented type and meaning. That promise is only worth the machinery behind it: without a
 * schema, "documented" has no definition, and a version describing an undefined shape promises
 * whatever the next reader assumes. `schemas/report.schema.json` is that definition, and this file
 * is what executes it — against real command output, never against a fixture written by hand. A
 * fixture would be a second opinion about the shape, and the drift between two opinions is silent.
 *
 * WHAT LIVES HERE RATHER THAN IN THE SCHEMA. Two presence rules that are conditional on a value:
 * top-level `status` appears exactly when `command` is "check", and a record's fourteen envelope
 * keys appear exactly when `parseError` is null. Both could be written as a `oneOf` discriminated
 * on the deciding field. ADR 0008 part 2 rejected that shape for the record schema — a branch per
 * variant duplicates the whole document and the copies drift — and ADR 0011 D4 applies the same
 * reasoning per command. So the shape is stated once and the conditional is stated here.
 *
 * THE MUTATION TESTS ARE THE POINT OF THE FILE. A schema that has only ever been shown to accept
 * valid documents has not been shown to reject anything, and "backward-compatible shape" stays
 * prose until something demonstrates which changes are compatible and which are not. The four
 * mutations below construct the defect and assert the guard fires: an undocumented key, a removed
 * documented key, a version that disagrees with itself, and a `status` on a command that reaches no
 * verdict. The fifth runs the other way — it adds an optional key TO THE SCHEMA and asserts real
 * reports still validate, which is the mechanical form of ADR 0011 D7's claim that an additive key
 * is a minor change.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validate, assertSchemaSupported } from "../scripts/jsonschema.mjs";
import { AGGREGATE_PRECEDENCE } from "../scripts/compliance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/predictions.mjs");
const SCHEMA_FILE = "schemas/report.schema.json";
const AS_OF = "2026-08-09T12:00:00Z";

/**
 * One unreadable record and one blocked record. Chosen because it is the only fixture that exercises
 * BOTH record shapes in a single document: the three-key parse-error entry and the seventeen-key
 * full entry. A corpus of readable records would leave half the contract unchecked.
 */
const MIXED = "test/fixtures/records/unreadable-and-blocked";

/** The four commands that emit this envelope. They share one builder, so they share one contract. */
const COMMANDS = ["check", "audit", "explain", "status"];

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, SCHEMA_FILE), "utf8"));

/** The version the schema pins, read from the schema rather than restated. */
const PINNED = schema.properties.schemaVersion.const;

/**
 * `maxBuffer` is raised past anything this suite produces, and `ENOBUFS` is rethrown rather than
 * read: the catch arm returns the error's stdout, which is right for a non-zero exit and would
 * otherwise hand back a TRUNCATED report to be parsed as a whole one.
 */
function report(command, target = MIXED) {
  const args = [CLI, command, target, `--as-of=${AS_OF}`, "--json"];
  const options = { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, options);
  } catch (error) {
    if (error.code === "ENOBUFS") throw error;
    stdout = error.stdout ?? "";
  }
  assert.ok(stdout.trim().length > 0, `predictions ${command} --json wrote nothing`);
  return JSON.parse(stdout);
}

const conforms = (document, against = schema) => {
  const errors = validate(document, against);
  assert.deepEqual(
    errors,
    [],
    `does not conform to ${SCHEMA_FILE}:\n  - ${errors
      .map((e) => `${e.path || "(document)"} ${e.message}`)
      .join("\n  - ")}`,
  );
};

/** A deep copy, so a mutation cannot leak into the next test through a shared object. */
const copy = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// 1. The schema is executable, and it describes what is actually emitted
// ---------------------------------------------------------------------------

test("the evaluator implements every keyword the report schema uses", () => {
  // First, and load-bearing. `validate` reports nothing about a keyword it does not implement, so
  // without this a green conformance result could mean "checked" or "silently skipped a
  // constraint", and those are opposite outcomes.
  assertSchemaSupported(schema);
});

for (const command of COMMANDS) {
  test(`${command} --json validates against ${SCHEMA_FILE}`, () => {
    conforms(report(command));
  });
}

test("the four commands emit one document, not four", () => {
  // The justification for one version covering all four (ADR 0011 D5). If they ever diverge beyond
  // `status`, one contract stops being honest and this is where that shows up.
  const keys = COMMANDS.map((c) => Object.keys(report(c)).filter((k) => k !== "status").sort());
  for (const set of keys) assert.deepEqual(set, keys[0]);
});

// ---------------------------------------------------------------------------
// 2. One version, agreed in three places
// ---------------------------------------------------------------------------

test("the emitted version, the schema's const and the exported constant all agree", async () => {
  // Three-way, because any two of them agreeing is a coincidence. The constant is imported
  // dynamically so that its absence is an assertion failure naming what is missing, rather than a
  // link error that takes the whole file down with it.
  const { REPORT_SCHEMA_VERSION } = await import("../scripts/compliance.mjs");
  assert.equal(REPORT_SCHEMA_VERSION, PINNED, "scripts/compliance.mjs disagrees with the schema");
  for (const command of COMMANDS) {
    assert.equal(report(command).schemaVersion, PINNED, `${command} --json emits another version`);
  }
});

test("the version is three-part semver, which the pack's own comparator can read", () => {
  // The reason "1.0" became "1.1.0" rather than "1.1": `atLeastRecordSchema` returns false for any
  // string that is not exactly three integer parts, so the one piece of version machinery this pack
  // owns could not read the envelope's version at all.
  assert.match(PINNED, /^\d+\.\d+\.\d+$/u);
});

test("a record's nested envelope carries the same version as the report", () => {
  // One version written in two emitters is two versions. The schema pins the same const in both
  // places, so this fails the moment they are allowed to drift.
  for (const record of report("check").records) {
    if (record.parseError) continue;
    assert.equal(record.schemaVersion, PINNED);
  }
});

// ---------------------------------------------------------------------------
// 3. The two conditional-presence rules, which the schema deliberately does not state
// ---------------------------------------------------------------------------

test("status is present exactly when the command is check", () => {
  for (const command of COMMANDS) {
    const document = report(command);
    if (command === "check") {
      assert.ok("status" in document, "check must publish a disposition");
      assert.ok(AGGREGATE_PRECEDENCE.includes(document.status));
    } else {
      assert.ok(
        !("status" in document),
        `${command} reaches no verdict by design (ADR 0007), so the key must be absent, not null`,
      );
    }
  }
});

test("a record carries its envelope exactly when it could be parsed", () => {
  const document = report("check");
  const always = ["file", "parseError", "status"];
  const fromEnvelope = Object.keys(schema.$defs.record.properties).filter((k) => !always.includes(k));
  assert.equal(fromEnvelope.length + always.length, 17, "the record contract is seventeen keys");

  let unreadable = 0;
  let readable = 0;
  for (const record of document.records) {
    if (record.parseError === null) {
      readable++;
      for (const key of fromEnvelope) assert.ok(key in record, `${record.file} is missing ${key}`);
    } else {
      unreadable++;
      // Not merely "has a status" — has ONLY the three. A parse-error entry carrying a partial
      // envelope would be a verdict assembled from a record nobody could read.
      assert.deepEqual(Object.keys(record).sort(), [...always].sort());
    }
  }
  assert.ok(readable > 0 && unreadable > 0, "the fixture must exercise both record shapes");
});

// ---------------------------------------------------------------------------
// 4. Mutations — what the schema rejects, and what it must keep accepting
// ---------------------------------------------------------------------------

test("an undocumented top-level key is rejected", () => {
  const document = copy(report("check"));
  document.summary = "a plausible-looking addition nobody documented";
  assert.notDeepEqual(validate(document, schema), []);
});

test("an undocumented key inside a record is rejected", () => {
  const document = copy(report("check"));
  document.records[0].confidence = 0.9;
  assert.notDeepEqual(validate(document, schema), []);
});

test("removing a documented required key is rejected — the compatibility promise, mechanically", () => {
  // ADR 0011 D7: removal is MAJOR, because it is the change that stops D1 holding. Asserted key by
  // key rather than for one representative, so a future edit that quietly drops a `required` entry
  // is caught by the test that claims to be checking exactly this.
  for (const key of schema.required) {
    const document = copy(report("check"));
    delete document[key];
    const errors = validate(document, schema);
    assert.notDeepEqual(errors, [], `removing '${key}' left the document valid`);
  }
  for (const key of schema.$defs.record.required) {
    const document = copy(report("check"));
    delete document.records[0][key];
    assert.notDeepEqual(validate(document, schema), [], `removing records[0].'${key}' left it valid`);
  }
});

test("adding an optional key to the contract keeps every existing report valid — additive is minor", () => {
  // The other direction, and the one that stops "backward-compatible" being prose. ADR 0011 D7 says
  // an added key is a MINOR bump precisely because reports written before it are still readable
  // under the extended contract. Here the extension is made and the claim is checked, rather than
  // asserted in a table nothing executes.
  const extended = copy(schema);
  extended.properties.evaluator = { type: "string" };
  extended.$defs.record.properties.evidenceDigest = { type: ["string", "null"] };
  for (const command of COMMANDS) conforms(report(command), extended);

  // And the extension is real: a document using it validates under the new contract and not the old.
  const using = copy(report("check"));
  using.evaluator = "predictions";
  conforms(using, extended);
  assert.notDeepEqual(validate(using, schema), [], "the extension was a no-op, so it proved nothing");
});

test("a version that disagrees with the schema is rejected", () => {
  const document = copy(report("check"));
  document.schemaVersion = "1.0";
  assert.notDeepEqual(validate(document, schema), []);

  const nested = copy(report("check"));
  const readable = nested.records.find((r) => r.parseError === null);
  readable.schemaVersion = "1.2.0";
  assert.notDeepEqual(validate(nested, schema), []);
});

test("a status on a command that reaches no verdict is rejected by the rule that owns it", () => {
  // The conditional lives in a test, so the falsifier has to live there too — otherwise the rule is
  // stated in exactly one place and nothing shows it can fail.
  const statusRule = (document) =>
    ("status" in document) === (document.command === "check")
      ? []
      : [`${document.command} must ${document.command === "check" ? "publish" : "omit"} status`];

  const audit = copy(report("audit"));
  assert.deepEqual(statusRule(audit), []);
  audit.status = "SUPPORTED";
  assert.notDeepEqual(statusRule(audit), [], "a verdict smuggled onto audit went unnoticed");

  const check = copy(report("check"));
  assert.deepEqual(statusRule(check), []);
  delete check.status;
  assert.notDeepEqual(statusRule(check), []);
});

// ---------------------------------------------------------------------------
// 5. `predictions policy --json` is a different document (ADR 0011 D5, C4)
// ---------------------------------------------------------------------------

test("policy --json carries no report-envelope version, and could not honestly carry one", () => {
  const args = [path.join(ROOT, "scripts/policy.mjs"), "project-policy.yml", "--json"];
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  } catch (error) {
    stdout = error.stdout ?? "";
  }
  const document = JSON.parse(stdout);

  assert.ok(
    !("schemaVersion" in document),
    "policy --json borrowed the report envelope's version for a document under no such contract",
  );

  // Why it was removed rather than renumbered: its `status` means something else entirely. A
  // consumer that wired this to a gate on the strength of a shared version string would read
  // "findings" as a verdict it is not.
  assert.ok(["ok", "findings", "invalid"].includes(document.status));
  assert.ok(!AGGREGATE_PRECEDENCE.includes(document.status), "the two vocabularies must stay disjoint");
  assert.notDeepEqual(validate(document, schema), [], "it must not validate as a report");
});
