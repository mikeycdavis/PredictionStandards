/**
 * The adapter declaration, checked against the contract it claims to satisfy and against the CLI it
 * describes.
 *
 * `standards-adapter.json` tells StandardsEnforcer how to invoke this pack and how to read the
 * answer. A declaration that drifts from either side is worse than no declaration: the enforcer runs
 * something, gets JSON back, and publishes a verdict for a question nobody asked. This pack has an
 * `explain` and a `status` subcommand that reach no verdict by design and emit no top-level `status`
 * key (ADR 0010), so naming the wrong one is not hypothetical — it would produce a report shaped
 * almost exactly like a verdict, minus the one field that carries it.
 *
 * WHERE THE PROTOCOL LIVES. In StandardsEnforcer, once. This file executes the schema rather than
 * restating it, so the copy under schemas/vendor/ is the same bytes, not a second opinion — see
 * schemas/vendor/provenance.json for why a copy exists and what it does and does not establish.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not check the enforcer's cross-field semantics by
 * re-deriving them from prose. Two are re-asserted below — `passing` as a subset of `statuses`, and
 * entrypoint containment — because both are properties the JSON Schema cannot express and both would
 * otherwise be enforced only at the consumer, after a release. Everything else the schema states, the
 * schema is left to state.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validate, assertSchemaSupported } from "../scripts/jsonschema.mjs";
import { AGGREGATE_PRECEDENCE, aggregateStatus, STATUS } from "../scripts/compliance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const CONTRACT_FILE = "standards-adapter.json";
const VENDORED_SCHEMA = "schemas/vendor/standards-adapter.schema.json";

const contract = JSON.parse(read(CONTRACT_FILE));
const schema = JSON.parse(read(VENDORED_SCHEMA));
const provenance = JSON.parse(read("schemas/vendor/provenance.json"));

/**
 * The authoritative checkout, when this machine has one.
 *
 * Absent in the container: local CI mounts this repository alone, read-only, with no network. So the
 * freshness comparison is environment-dependent and says so, while conformance against the recorded
 * protocol is not and always runs.
 */
function authoritativeSchemaPath() {
  const candidates = [
    process.env.STANDARDS_ENFORCER_DIR,
    path.resolve(ROOT, "..", provenance.repository),
  ].filter(Boolean);
  for (const dir of candidates) {
    const file = path.join(dir, provenance.path);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

// ---- The declaration conforms to the protocol. ----

test("the evaluator implements every keyword the adapter schema uses", () => {
  // Runs first, and matters more than it looks. `validate` reports nothing about a keyword it does
  // not implement, so without this assertion a green conformance test could mean "checked" or
  // "silently skipped `contains`", and those are opposite results.
  assertSchemaSupported(schema);
});

test("standards-adapter.json validates against the StandardsEnforcer adapter schema", () => {
  const errors = validate(contract, schema);
  assert.deepEqual(
    errors,
    [],
    `${CONTRACT_FILE} does not conform:\n  - ${errors
      .map((e) => `${e.path || "(document)"} ${e.message}`)
      .join("\n  - ")}`,
  );
});

test("the vendored schema is the authoritative one, where this machine can see it", (t) => {
  const authoritative = authoritativeSchemaPath();
  if (!authoritative) {
    // Reported, never passed over in silence. The conformance test above still ran; what is
    // unavailable here is only the evidence that the protocol has not moved since it was copied.
    t.skip(
      `no ${provenance.repository} checkout is reachable, so the vendored copy could not be compared ` +
        `against ${provenance.path} at ${provenance.commit}. Conformance was still checked.`,
    );
    return;
  }
  assert.equal(
    read(VENDORED_SCHEMA),
    fs.readFileSync(authoritative, "utf8"),
    `${VENDORED_SCHEMA} differs from ${authoritative}. Re-copy it and update schemas/vendor/provenance.json ` +
      "in the same edit; a stale copy would report conformance to a protocol nobody is enforcing.",
  );
});

test("the schema alone would admit an entrypoint that leaves this checkout, and this one does not", () => {
  // The schema's pattern rejects an absolute POSIX path and any backslash, which is necessary and
  // not sufficient — "../../../etc/passwd" matches it happily. Containment is a property of the
  // segments, so it is decided by looking at them.
  const entrypoint = contract.evaluation.entrypoint;
  assert.ok(!path.isAbsolute(entrypoint) && !/^[a-zA-Z]:/u.test(entrypoint), "the entrypoint is absolute");
  assert.ok(!entrypoint.split(/[/\\]/u).includes(".."), "the entrypoint escapes this checkout with '..'");
  assert.ok(fs.existsSync(path.join(ROOT, entrypoint)), `${entrypoint} is not in this repository`);
});

test("schemaVersion 1.0.0 admits only {target}, and this contract uses only {target}", () => {
  // 1.1.0 exists and admits {policy} as well. Declaring it would make this contract unreadable to
  // every enforcer built before that binding — the correct outcome for a pack that needs it, and a
  // cost for nothing in a pack that does not. The evidence that this pack does not is the last test
  // in this file.
  assert.equal(contract.schemaVersion, "1.0.0");
  const used = contract.evaluation.arguments.flatMap((a) => a.match(/\{[^}]*\}/gu) ?? []);
  assert.deepEqual([...new Set(used)], ["{target}"]);
});

// ---- The declared vocabulary is this pack's vocabulary. ----

test("the declared statuses are exactly the ones this pack's aggregate can publish", () => {
  // Set equality, not containment, and in both directions. A missing status would fail closed at the
  // enforcer on a value this pack really does emit; a surplus one would declare a verdict this pack
  // cannot reach, and if it were also listed in `passing` it would be a pass nobody can audit.
  assert.deepEqual([...contract.result.statuses].sort(), [...AGGREGATE_PRECEDENCE].sort());
});

test("every declared status is producible: the fold returns each one", () => {
  // `check --json` publishes exactly what `aggregateStatus` returns over the record statuses, so a
  // status the fold can return is a status the top-level key can carry. A single-record set is the
  // smallest witness for each.
  for (const status of contract.result.statuses) {
    assert.equal(aggregateStatus([status]), status);
  }
});

test("every passing value is in statuses", () => {
  for (const status of contract.result.passing) {
    assert.ok(
      contract.result.statuses.includes(status),
      `passing lists ${status}, which is not in the declared vocabulary`,
    );
  }
});

test("blocked, insufficiently supported and not evaluated are not passing", () => {
  // Stated as three named values rather than as "the complement", because the complement would be
  // satisfied by an empty `passing` too, and that is a different declaration.
  for (const status of [STATUS.BLOCKED_BY_INVARIANT, STATUS.INSUFFICIENTLY_SUPPORTED, STATUS.NOT_EVALUATED]) {
    assert.ok(!contract.result.passing.includes(status), `${status} is declared passing`);
  }
  assert.deepEqual(contract.result.passing, [STATUS.SUPPORTED, STATUS.SUPPORTED_WITH_EXCEPTIONS]);
});

// ---- The declared invocation is the one that produces a verdict. ----

/** A target that is emphatically not this repository, carrying its own policy and one record. */
function externalTarget(recordSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prediction-adapter-"));
  fs.mkdirSync(path.join(dir, "records"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, recordSource), path.join(dir, "records", path.basename(recordSource)));
  fs.writeFileSync(
    path.join(dir, "project-policy.yml"),
    read("project-policy.yml").replace('project: "PredictionStandards"', 'project: "ADAPTER-EXTERNAL-TARGET"'),
  );
  return dir;
}

function run(args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, contract.evaluation.entrypoint), ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    cwd: ROOT,
  });
  assert.ok(r.stdout && r.stdout.trim(), "no stdout: " + (r.stderr || "").split("\n")[0]);
  return { report: JSON.parse(r.stdout), stdout: r.stdout, exitCode: r.status };
}

/** The enforcer's binding, performed here exactly as scripts/contracts/adapter.mjs performs it. */
const viaContract = (target) => run(contract.evaluation.arguments.map((a) => a.replaceAll("{target}", target)));

test("the declared invocation produces the top-level status the contract promises", () => {
  const target = externalTarget("examples/records/supported-prediction.json");
  try {
    const { report } = viaContract(target);
    assert.ok(
      Object.prototype.hasOwnProperty.call(report, "status"),
      "the report carries no top-level status; the enforcer reads the verdict from exactly this key",
    );
    assert.ok(
      contract.result.statuses.includes(report.status),
      `reported ${report.status}, which ${CONTRACT_FILE} does not declare`,
    );
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test("the declared invocation reaches a non-passing verdict too, and says which", () => {
  // The suite would otherwise only ever have watched this contract agree with a green run. The
  // fixture holds one blocked record and one unreadable file, so the aggregate is NOT_EVALUATED —
  // the case a consumer is most likely to misread, and the one worth proving travels intact.
  const { report } = viaContract(path.join(ROOT, "test/fixtures/records/unreadable-and-blocked"));
  assert.equal(report.status, STATUS.NOT_EVALUATED);
  assert.ok(!contract.result.passing.includes(report.status));
  assert.ok(
    report.aggregate.blockedByInvariant > 0,
    "nothing was blocked, so this fixture proves less than it should",
  );
});

test("a report large enough to fill a pipe arrives whole", () => {
  // The defect this caught, stated plainly: the CLI wrote the report and then called
  // `process.exit`, which does not wait for a pipe to drain. Over this fixture that delivered about
  // 214 KB of a 250 KB document — a well-formed prefix ending mid-string, and a parse error the
  // consumer would have no reason to attribute to the producer.
  //
  // It is asserted here rather than only in test/aggregate.test.mjs because the adapter is what
  // makes it consequential: StandardsEnforcer spawns this exact argv and parses this exact stream,
  // so a truncated report is not a cosmetic fault but the verdict failing to arrive at all.
  const { report, stdout } = viaContract(path.join(ROOT, "test/fixtures/records/falsifiability"));
  // 219,192 is not a round number because it is not a limit — it is where the truncated stream
  // actually stopped. A fixture that no longer reaches past it has stopped testing this.
  assert.ok(
    stdout.length > 219_192,
    `this fixture emitted only ${stdout.length} bytes; it no longer crosses the boundary that truncated`,
  );
  assert.ok(contract.result.statuses.includes(report.status));
  // The last record parsed, which is the part a truncation takes first.
  assert.ok(report.records.length > 0 && report.records.at(-1).status);
});

test("the contract does not name a subcommand that reaches no verdict", () => {
  // `status` and `explain` emit no top-level status BY DESIGN (ADR 0010), and their absence of a
  // verdict must never be read as one. A contract naming either would validate against the schema
  // perfectly and be wrong in the one way nothing downstream could detect.
  assert.equal(contract.evaluation.arguments[0], "check");
  assert.ok(!contract.evaluation.arguments.includes("status"));
  assert.ok(!contract.evaluation.arguments.includes("explain"));

  const target = externalTarget("examples/records/supported-prediction.json");
  try {
    for (const command of ["status", "explain"]) {
      const { report } = run([command, target, "--json"]);
      assert.ok(
        !Object.prototype.hasOwnProperty.call(report, "status"),
        `${command} --json now carries a top-level status; the reason this contract names check has changed`,
      );
    }
    // And the mutation: the contract's own command does carry it. Without this, the two assertions
    // above would pass just as well against a CLI that had stopped emitting the key everywhere.
    assert.ok(Object.prototype.hasOwnProperty.call(viaContract(target).report, "status"));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test("the target's own policy wins over this pack's, which is what lets the contract stay at 1.0.0", () => {
  // The evidence behind the version choice. StandardsEnforcer proves <target>/project-policy.yml
  // exists before it invokes anything, and this pack's resolution walks up from the target — so the
  // first candidate it finds is the file {policy} would have bound. The fallback to this pack's own
  // policy is real (scripts/predictions.mjs `resolvePolicyPath`) and is unreachable under that
  // invocation. This is also the target-identity check: an evaluator that ignored its argument and
  // graded its own checkout would satisfy every assertion above and fail this one.
  const target = externalTarget("examples/records/supported-prediction.json");
  try {
    const { report } = viaContract(target);
    assert.equal(path.resolve(report.policy), path.resolve(target, "project-policy.yml"));
    assert.notEqual(path.resolve(report.policy), path.join(ROOT, "project-policy.yml"));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
