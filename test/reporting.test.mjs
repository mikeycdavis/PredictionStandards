/**
 * What the human-readable report says about a run of more than one record.
 *
 * The defect this file exists for: the directory summary took the FIRST record's assurance figures
 * and printed them as though they described the run. In a heterogeneous directory that makes the
 * summary contradict the per-record results printed immediately above it — and heterogeneous
 * directories are now ordinary, because a record at record schema 1.0.0 leaves
 * `falsifiability.declared` not-evaluated where a 1.1.0 record answers it (ADR 0008).
 *
 * The fixtures in test/fixtures/records/mixed-assurance/ are three deliberately different profiles:
 * a current prediction, the same prediction at the older schema version, and an abstention. No
 * record in that directory can stand for the others.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/predictions.mjs");
const DIR = "test/fixtures/records/mixed-assurance";
const AS_OF = "2026-08-09T12:00:00Z";

const run = (...args) =>
  execFileSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8" });

const text = run("check", DIR, `--as-of=${AS_OF}`);
const json = JSON.parse(run("check", DIR, `--as-of=${AS_OF}`, "--json"));
const envelopes = json.records;

test("the fixtures really do have different assurance profiles", async () => {
  // If this fails the rest of the file proves nothing, so it is asserted rather than assumed.
  const files = await readdir(path.join(ROOT, DIR));
  assert.equal(files.length, 3);
  const profiles = new Set(
    envelopes.map((e) => `${e.assurance.automated}/${e.assurance.manualReview}/${e.assurance.notEvaluated}`),
  );
  assert.equal(profiles.size, 3, "the fixtures must not converge on one profile");
});

test("the legacy record is not evaluated for the rule its format cannot answer", async () => {
  const legacy = json.records.find((r) => r.file.includes("legacy"));
  const current = json.records.find((r) => r.file.includes("current"));
  const of = (rec, id) => rec.results.find((x) => x.ruleId === id);
  assert.equal(of(legacy, "falsifiability.declared").disposition, "not-evaluated");
  assert.equal(of(current, "falsifiability.declared").status, "passed");
  // Which is exactly why the two records cannot share one assurance line.
  assert.notEqual(legacy.assurance.notEvaluated, current.assurance.notEvaluated);
});

test("the directory summary reports totals across the run, not one record's figures", () => {
  const line = text.split("\n").find((l) => l.includes("Assurance:"));
  assert.ok(line, "the summary should report assurance");
  const [, automated, manual, notEvaluated] = /(\d+) automated, (\d+) human-reviewed, (\d+) not evaluated/.exec(line);
  const expected = envelopes.reduce(
    (acc, e) => ({
      automated: acc.automated + e.assurance.automated,
      manualReview: acc.manualReview + e.assurance.manualReview,
      notEvaluated: acc.notEvaluated + e.assurance.notEvaluated,
    }),
    { automated: 0, manualReview: 0, notEvaluated: 0 },
  );
  assert.equal(Number(automated), expected.automated);
  assert.equal(Number(manual), expected.manualReview);
  assert.equal(Number(notEvaluated), expected.notEvaluated);

  // The specific regression: the first record's figures must not be what is printed.
  const first = envelopes[0].assurance;
  assert.notEqual(
    `${automated}/${manual}/${notEvaluated}`,
    `${first.automated}/${first.manualReview}/${first.notEvaluated}`,
    "the summary is showing one record's assurance as though it described the run",
  );
});

test("the summary says the figures are totals, and says when the records differ", () => {
  assert.match(text, /rule outcomes across 3 records/);
  assert.match(text, /Records differ in what could be evaluated \(3 distinct profiles\)/);
});

test("a single-record run states its assurance plainly, with no aggregation language", () => {
  const single = run("check", path.join(DIR, "current-prediction.json"), `--as-of=${AS_OF}`);
  assert.match(single, /Assurance: /);
  assert.doesNotMatch(single, /rule outcomes across/);
  assert.doesNotMatch(single, /Records differ/);
});

test("framework coverage is not summed — it describes the catalog, not the records", () => {
  const line = text.split("\n").find((l) => l.includes("Coverage:"));
  const [, evaluated, catalogued] = /(\d+)\/(\d+) rules have a detector/.exec(line);
  assert.equal(Number(evaluated), envelopes[0].frameworkCoverage.evaluatedRules);
  assert.equal(Number(catalogued), envelopes[0].frameworkCoverage.cataloguedRules);
  for (const e of envelopes) {
    assert.deepEqual(e.frameworkCoverage, envelopes[0].frameworkCoverage, "coverage must not vary by record");
  }
});

test("the JSON output was already per-record and stays that way", async () => {
  // The defect was in rendering only. This asserts the machine-readable path never had it, so the
  // fix is not quietly changing what a consumer parses.
  for (const record of json.records) {
    assert.ok(record.assurance, `${record.file} should carry its own assurance`);
  }
  assert.equal(json.assurance, undefined, "the run envelope does not claim a single assurance figure");
});
