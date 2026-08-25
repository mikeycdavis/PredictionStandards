/**
 * Documentation consistency.
 *
 * Prose drifts from machinery silently. A standard can lose its rule, a README table can keep a
 * row for a file somebody renamed, a rule can point at a standard that no longer discusses it, and
 * nothing fails — the documents still read perfectly well, they are simply no longer true.
 *
 * These tests fail instead. The most important is the last: a rule's protection cannot change
 * without CHANGELOG.md naming it, which is the recorded half of Standard 18 R3.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalog } from "../scripts/catalog.mjs";
import { EVALUATED_RULES } from "../scripts/records.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

const catalog = await loadCatalog();
const inventory = JSON.parse(await read("artifacts/standards-source-inventory.json"));
const baseline = JSON.parse(await read("artifacts/integrity-baseline.json"));
const packageJson = JSON.parse(await read("package.json"));
const standardsFiles = (await readdir(path.join(ROOT, "standards"))).filter((f) => f.endsWith(".md")).sort();

test("every standard in the inventory has its document on disk", () => {
  for (const standard of inventory.standards) {
    assert.ok(existsSync(path.join(ROOT, standard.implementedBy)), `${standard.implementedBy} is missing`);
  }
});

test("there are no standards documents the inventory does not know about", () => {
  const claimed = new Set(inventory.standards.map((s) => path.basename(s.implementedBy)));
  for (const file of standardsFiles) {
    assert.ok(claimed.has(file), `standards/${file} exists but no inventory entry points at it`);
  }
});

test("the series is numbered 1..N with no gaps", () => {
  const numbers = inventory.standards.map((s) => s.number);
  assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, i) => i + 1));
});

test("each standard document declares the number it is filed under", async () => {
  for (const standard of inventory.standards) {
    const text = await read(standard.implementedBy);
    const heading = text.split("\n")[0];
    assert.match(heading, new RegExp(`^# Standard ${standard.number} — `), `${standard.implementedBy} has a mismatched title`);
  }
});

test("each standard document cites where it came from", async () => {
  // A source-derived standard cites its specification. An evidence-derived one cites the committed
  // artifact that disposed of the evidence (ADR 0009) — the point of the origin field is that
  // "we learned this from adoption" is a citable claim rather than an exemption from citing.
  for (const standard of inventory.standards) {
    const text = await read(standard.implementedBy);
    if (standard.origin === "evidence") {
      assert.equal(standard.source, null, `${standard.implementedBy} is evidence-derived but names a source`);
      assert.ok(
        text.includes(standard.derivedFrom),
        `${standard.implementedBy} does not cite ${standard.derivedFrom}`,
      );
    } else {
      assert.ok(text.includes(standard.source), `${standard.implementedBy} does not cite ${standard.source}`);
    }
  }
});

test("each standard document carries the required sections", async () => {
  for (const standard of inventory.standards) {
    const text = await read(standard.implementedBy);
    for (const section of ["## Requirements", "## Additions this standard makes beyond the source", "## Implementation"]) {
      assert.ok(text.includes(section), `${standard.implementedBy} is missing '${section}'`);
    }
  }
});

test("every standard that owns a prohibition has a Prohibitions section", async () => {
  const owning = new Set(inventory.prohibitions.map((p) => p.standard));
  for (const standard of inventory.standards) {
    const text = await read(standard.implementedBy);
    if (owning.has(standard.number)) {
      assert.ok(text.includes("## Prohibitions"), `${standard.implementedBy} owns a prohibition but has no Prohibitions section`);
    }
  }
});

test("every prohibition's rule id appears in the standard that owns it", async () => {
  for (const prohibition of inventory.prohibitions) {
    const standard = inventory.standards.find((s) => s.number === prohibition.standard);
    const text = await read(standard.implementedBy);
    assert.ok(
      text.includes(prohibition.rule),
      `${standard.implementedBy} owns prohibition ${prohibition.number} but never names ${prohibition.rule}`,
    );
  }
});

test("every rule is named by the standard document it belongs to", async () => {
  // A rule its own standard never mentions is one nobody can find from the prose.
  for (const rule of catalog.rules.values()) {
    const standard = inventory.standards.find((s) => s.number === rule.standard);
    const text = await read(standard.implementedBy);
    assert.ok(text.includes(rule.id), `${standard.implementedBy} never names ${rule.id}`);
  }
});

test("the README status table has a row per standard, pointing at a real file", async () => {
  const readme = await read("README.md");
  for (const standard of inventory.standards) {
    assert.ok(readme.includes(standard.implementedBy), `README does not link ${standard.implementedBy}`);
  }
});

test("every standard and ADR a script cites exists in this repository", async () => {
  // Reference-port debris. The evaluator machinery was adapted from a 44-standard pack, and seven
  // comments still cited that pack's numbering — "Standard 24 R2", "Standard 39 R4", an ADR 0003
  // that here is about something else entirely. None affected behaviour, and all of them told a
  // reader to go and look up a requirement that does not exist. This is the cheap guard against the
  // next one, and against a citation going stale when the series changes.
  const files = (await readdir(path.join(ROOT, "scripts"))).filter((f) => f.endsWith(".mjs"));
  const highest = Math.max(...inventory.standards.map((s) => s.number));
  const adrs = new Set(
    (await readdir(path.join(ROOT, "artifacts/adr"))).map((f) => f.slice(0, 4)),
  );
  for (const file of files) {
    const text = await read(path.join("scripts", file));
    for (const [, number] of text.matchAll(/\bStandard (\d+)\b/g)) {
      const n = Number(number);
      assert.ok(n >= 1 && n <= highest, `scripts/${file} cites Standard ${n}; this series runs 1..${highest}`);
    }
    for (const [, number] of text.matchAll(/\bADR (\d{4})\b/g)) {
      assert.ok(adrs.has(number), `scripts/${file} cites ADR ${number}, which does not exist`);
    }
  }
});

test("every npm script the docs mention actually exists", async () => {
  const scripts = new Set(Object.keys(packageJson.scripts));
  const docs = (await read("README.md")) + (await read("INSTRUCTIONS.md")) + (await read("PROJECT.md"));
  for (const match of docs.matchAll(/npm run ([a-z:]+)/g)) {
    assert.ok(scripts.has(match[1]), `the docs mention 'npm run ${match[1]}' but package.json has no such script`);
  }
});

test("every CLI command the docs mention is one the CLI implements", async () => {
  const cli = await read("scripts/predictions.mjs");
  const implemented = /\["init", "audit", "check", "explain", "status"\]/.test(cli);
  assert.ok(implemented, "the command list in predictions.mjs changed; update this test and the docs together");
  const docs = (await read("README.md")) + (await read("INSTRUCTIONS.md"));
  for (const match of docs.matchAll(/predictions (init|audit|check|explain|status|plan|validate)\b/g)) {
    assert.ok(
      ["init", "audit", "check", "explain", "status"].includes(match[1]),
      `the docs mention 'predictions ${match[1]}', which the CLI does not implement`,
    );
  }
});

test("the boundary and model documents exist and are linked from the README", async () => {
  const readme = await read("README.md");
  for (const doc of ["docs/ml-vs-prediction-boundary.md", "docs/prediction-model.md", "docs/design/concepts.md"]) {
    assert.ok(existsSync(path.join(ROOT, doc)), `${doc} is missing`);
    assert.ok(readme.includes(doc), `the README does not link ${doc}`);
  }
});

test("the version is stated once and agreed everywhere", async () => {
  const version = (await read("VERSION")).trim();
  assert.equal(packageJson.version, version);
  assert.equal(baseline.standardVersion, version);
  assert.ok((await read("CHANGELOG.md")).includes(version), `CHANGELOG.md does not mention ${version}`);

  // The README's own declaration, added after it survived a whole release saying "Version 1.0.0"
  // while VERSION, package.json and the baseline had all moved to 1.1.0. The three that were checked
  // agreed with each other; the one that was not checked is the one a reader sees first. An
  // agreement proof that omits a statement of the same fact is not a proof that the fact is stated
  // once.
  //
  // Matched rather than searched for. `includes(version)` would pass on any README mentioning the
  // number anywhere — in a changelog link, a code sample, a historical note — and would therefore
  // have gone green on the stale declaration the moment 1.0.0 appeared in some other sentence.
  const declared = /^Version (\S+) — see \[VERSION\]\(VERSION\)/mu.exec(await read("README.md"));
  assert.ok(declared, "the README no longer carries a version declaration in the form this checks");
  assert.equal(declared[1], version, "the README's version declaration is stale");
});

test("the coverage the README claims matches what the evaluator actually evaluates", async () => {
  // The number most likely to be written once and left behind.
  const readme = await read("README.md");
  const match = /(\d+) of the (\d+) rules/.exec(readme);
  assert.ok(match, "the README should state how many rules have detectors");
  assert.equal(Number(match[1]), EVALUATED_RULES.length, "the README's evaluated-rule count is stale");
  assert.equal(Number(match[2]), catalog.rules.size, "the README's total rule count is stale");
});

test("a change to any rule's protection is recorded in the changelog", async () => {
  // The recorded half of the integrity ratchet. The baseline file makes weakening visible in a
  // diff; this makes it visible in the changelog, where it has to be explained rather than merely
  // shown. Both halves are needed: a baseline edit alone is a change nobody justified.
  const changelog = await read("CHANGELOG.md");
  for (const [id, recorded] of Object.entries(baseline.rules)) {
    const rule = catalog.rules.get(id);
    const changed =
      rule.level !== recorded.level ||
      rule.nonExemptible !== recorded.nonExemptible ||
      rule.severity !== recorded.severity;
    if (changed) {
      assert.ok(changelog.includes(id), `${id}'s protection differs from the baseline and CHANGELOG.md does not name it`);
    }
  }
});

test("the changelog states the rule that weakening a rule must be recorded", async () => {
  const changelog = await read("CHANGELOG.md");
  assert.match(changelog, /nonExemptible/);
  assert.match(changelog, /integrity-baseline/);
});

test("templates route to the standards rather than restating them", async () => {
  // A copied standard is a second definition that drifts from the first. Each template must be
  // shorter than the document it points at.
  for (const [template, target] of [
    ["templates/AGENTS.md", "INSTRUCTIONS.md"],
    ["templates/CLAUDE.md", "templates/AGENTS.md"],
  ]) {
    const t = await read(template);
    const d = await read(target);
    assert.ok(t.length < d.length, `${template} is longer than ${target}; it is restating rather than routing`);
  }
});

test("INSTRUCTIONS.md tells an agent what to do when blocked by an invariant", async () => {
  const instructions = await read("INSTRUCTIONS.md");
  assert.match(instructions, /BLOCKED_BY_INVARIANT/);
  assert.match(instructions, /stop/i);
});
