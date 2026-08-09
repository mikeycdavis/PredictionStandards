/**
 * Policy validation: the schema, the parameter coercion, and the compliance conditions a
 * well-formed policy can still fail.
 *
 * The fixtures under test/fixtures/policies are known-negatives — each is a specific way a policy
 * can be wrong, kept on disk so the failure modes stay visible rather than living only in
 * assertions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkPolicy, coerceParameters } from "../scripts/policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const FIXTURES = path.join(ROOT, "test/fixtures/policies");
const TODAY = "2026-08-09";

const check = (name) => checkPolicy(path.join(FIXTURES, name), SCHEMA, TODAY);
const hasFinding = (result, id) => result.findings.some((f) => f.id === id);

test("this repository's own policy is valid", async () => {
  // Dogfooding: the policy shipped here is evaluated on every run, so its mechanisms are ones this
  // project has had to answer for rather than only describe.
  const result = await checkPolicy(path.join(ROOT, "project-policy.yml"), SCHEMA, TODAY);
  assert.equal(result.status, "ok", JSON.stringify(result.errors ?? result.findings));
});

test("a minimal valid policy passes", async () => {
  assert.equal((await check("valid.yml")).status, "ok");
});

test("a policy with an unknown key is rejected, not ignored", async () => {
  const result = await check("invalid-shape.yml");
  assert.equal(result.status, "invalid");
  assert.ok(result.errors.length > 0);
});

test("a camelCase rule id is rejected by the schema itself", async () => {
  // Canonical identity enforced at the boundary, so a second spelling cannot enter the system.
  const result = await check("non-canonical-id.yml");
  assert.equal(result.status, "invalid");
});

test("a rule id the catalog does not define is a finding, not a silent no-op", async () => {
  // A typo'd exception protects nothing, and without this check it reads as a valid waiver.
  const result = await check("unknown-rule.yml");
  assert.equal(result.status, "findings");
  assert.ok(hasFinding(result, "policy.unknown-rule"));
});

test("an exception against a non-exemptible rule is reported here, before any evaluation", async () => {
  const result = await check("non-exemptible-exception.yml");
  assert.equal(result.status, "findings");
  assert.ok(hasFinding(result, "policy.non-exemptible-rule"));
});

test("a policy downgrading a non-exemptible rule's level is reported", async () => {
  const result = await check("non-exemptible-downgrade.yml");
  assert.ok(hasFinding(result, "policy.non-exemptible-downgrade"));
});

test("a policy declaring a non-exemptible rule not-applicable is reported", async () => {
  const result = await check("non-exemptible-not-applicable.yml");
  assert.ok(hasFinding(result, "policy.non-exemptible-not-applicable"));
});

test("an expired exception is a finding", async () => {
  const result = await check("expired-exception.yml");
  assert.ok(hasFinding(result, "policy.expired-exception"));
});

test("a rule declared both not-applicable and excepted is ambiguous, and says so", async () => {
  // The two mechanisms make incompatible claims: one says the rule has no subject, the other says
  // it applies and is knowingly unmet. There is no safe way to pick one.
  const result = await check("conflicting-classification.yml");
  assert.ok(hasFinding(result, "policy.conflicting-classification"));
});

test("an attestation with no evidence is rejected by the schema", async () => {
  // An attestation without evidence is an assertion, which is the thing the mechanism exists to
  // avoid.
  const result = await check("attestation-without-evidence.yml");
  assert.equal(result.status, "invalid");
});

test("a policy may declare thresholds, and they arrive as numbers", async () => {
  const result = await check("parameters.yml");
  assert.equal(result.status, "ok");
  assert.equal(result.document.parameters.minSampleSize, 500);
  assert.equal(typeof result.document.parameters.minSampleSize, "number");
  assert.equal(typeof result.document.parameters.disagreementThreshold, "number");
});

test("a malformed threshold fails as a configuration error rather than defaulting", async () => {
  // Number("high") is NaN and Number("") is 0. Either would put a threshold nobody wrote into the
  // middle of a verdict.
  const result = await check("bad-parameter.yml");
  assert.equal(result.status, "invalid");
  assert.ok(result.errors.some((e) => e.path === "parameters.minSampleSize"));
});

test("parameter coercion converts only the numeric keys, and only from clean literals", () => {
  const document = {
    parameters: {
      minSampleSize: "30",
      disagreementThreshold: "0.1",
      tolerance: "1e-4",
      defaultFreshnessWindow: "P7D",
    },
  };
  assert.deepEqual(coerceParameters(document), []);
  assert.equal(document.parameters.minSampleSize, 30);
  assert.equal(document.parameters.disagreementThreshold, 0.1);
  assert.equal(document.parameters.tolerance, 0.0001);
  assert.equal(document.parameters.defaultFreshnessWindow, "P7D", "a duration is text and must stay text");
});

test("coercion refuses anything that is not a clean numeric literal", () => {
  for (const bad of ["thirty", "", "30 days", "0x1E", "1,000"]) {
    const document = { parameters: { minSampleSize: bad } };
    const problems = coerceParameters(document);
    assert.equal(problems.length, 1, `'${bad}' should not have converted`);
    assert.equal(document.parameters.minSampleSize, bad, "the raw value stays so the schema rejects it too");
  }
});

test("a policy with no parameters block is fine", () => {
  const document = { standardVersion: "1.0.0" };
  assert.deepEqual(coerceParameters(document), []);
});
