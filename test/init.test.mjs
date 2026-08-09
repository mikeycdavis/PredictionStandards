/**
 * The init safety contract.
 *
 * The property that matters most is the one the standards-system specification names directly:
 * dry-run and apply must derive from the same plan, so the preview is what actually happens. These
 * tests assert that by executing the plan a dry run produced and comparing the result, rather than
 * by inspecting the two code paths and hoping.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARTIFACTS, plan, apply, render } from "../scripts/init.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = () => mkdtemp(path.join(tmpdir(), "prediction-init-"));

test("a fresh project plans to create every artifact and nothing else", async () => {
  const root = await scratch();
  const report = await plan(root);
  assert.deepEqual(report.created.sort(), ARTIFACTS.map((a) => a.path).sort());
  assert.deepEqual(report.conflicts, []);
  assert.deepEqual(report.overwrites, []);
});

test("planning writes nothing", async () => {
  // The dry-run guarantee. If plan() touched the filesystem, --dry-run would be a lie.
  const root = await scratch();
  await plan(root);
  assert.equal((await readdir(root)).length, 0);
});

test("dry-run and apply derive from the same plan", async () => {
  // Compute a plan once, render it as a dry run would, then execute that exact plan. What was
  // written must be exactly what the preview listed — no second traversal, no divergence.
  const root = await scratch();
  const report = await plan(root);
  const previewed = report.actions
    .filter((a) => a.action === "create" || a.action === "overwrite")
    .map((a) => a.path)
    .sort();

  const rendered = render(report, { dryRun: true });
  assert.match(rendered, /nothing was written/);
  for (const p of previewed) assert.ok(rendered.includes(p), `the preview omits ${p}`);

  const written = await apply(root, report);
  assert.deepEqual(written.sort(), previewed);
  for (const p of written) assert.ok(existsSync(path.join(root, p)));
});

test("a second run preserves what the first wrote", async () => {
  const root = await scratch();
  await apply(root, await plan(root));
  const second = await plan(root);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.conflicts, []);
  assert.equal(second.preserved.length, ARTIFACTS.length);
});

test("an edited file is a conflict, and nothing is written for it", async () => {
  const root = await scratch();
  await apply(root, await plan(root));
  const target = path.join(root, "AGENTS.md");
  await writeFile(target, "edited by hand", "utf8");

  const report = await plan(root);
  assert.equal(report.conflicts.length, 1);
  assert.equal(report.conflicts[0].path, "AGENTS.md");

  const written = await apply(root, report);
  assert.ok(!written.includes("AGENTS.md"));
  assert.equal(await readFile(target, "utf8"), "edited by hand", "the edit survived");
});

test("approving one path does not approve another", async () => {
  // A blanket --force would make "replace everything" one keystroke from "replace the one I meant".
  const root = await scratch();
  await apply(root, await plan(root));
  await writeFile(path.join(root, "AGENTS.md"), "edited", "utf8");
  await writeFile(path.join(root, "CLAUDE.md"), "also edited", "utf8");

  const report = await plan(root, { overwrite: ["AGENTS.md"] });
  assert.deepEqual(report.overwrites, ["AGENTS.md"]);
  assert.deepEqual(report.conflicts.map((c) => c.path), ["CLAUDE.md"]);

  await apply(root, report);
  assert.notEqual(await readFile(path.join(root, "AGENTS.md"), "utf8"), "edited", "approved file replaced");
  assert.equal(await readFile(path.join(root, "CLAUDE.md"), "utf8"), "also edited", "unapproved file untouched");
});

test("an overwrite is marked destructive so a reader cannot miss it", async () => {
  const root = await scratch();
  await apply(root, await plan(root));
  await writeFile(path.join(root, "AGENTS.md"), "edited", "utf8");
  const report = await plan(root, { overwrite: ["AGENTS.md"] });
  const action = report.actions.find((a) => a.path === "AGENTS.md");
  assert.equal(action.destructive, true);
  assert.match(render(report, { dryRun: true }), /OVERWRITE/);
});

test("init creates nested directories rather than failing on them", async () => {
  const root = await scratch();
  await apply(root, await plan(root));
  assert.ok(existsSync(path.join(root, "records/example-prediction.json")));
});

test("the scaffolded project passes its own policy check", async () => {
  // The scaffold must produce something that works. A template that fails the first check it meets
  // teaches an adopter that the checks are noise.
  const root = await scratch();
  await apply(root, await plan(root));
  const { checkPolicy } = await import("../scripts/policy.mjs");
  const result = await checkPolicy(
    path.join(root, "project-policy.yml"),
    path.join(ROOT, "schemas/project-policy.schema.json"),
    "2026-08-09",
  );
  assert.equal(result.status, "ok", JSON.stringify(result.errors ?? result.findings));
});

test("the scaffolded record validates against the record schema", async () => {
  const root = await scratch();
  await apply(root, await plan(root));
  const { validate } = await import("../scripts/jsonschema.mjs");
  const schema = JSON.parse(await readFile(path.join(ROOT, "schemas/prediction-record.schema.json"), "utf8"));
  const record = JSON.parse(await readFile(path.join(root, "records/example-prediction.json"), "utf8"));
  assert.deepEqual(validate(record, schema), []);
});

test("every artifact names a template that exists", async () => {
  // plan() reads each template to decide create-versus-preserve, so a missing one fails the run
  // before anything is written. Asserting they exist keeps that failure from ever being reachable.
  for (const artifact of ARTIFACTS) {
    const template = path.join(ROOT, artifact.template);
    assert.ok(existsSync(template), `${artifact.path} names ${artifact.template}, which does not exist`);
    const content = await readFile(template, "utf8");
    assert.ok(content.trim().length > 0, `${artifact.template} is empty`);
  }
});
