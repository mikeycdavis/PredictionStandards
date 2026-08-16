#!/usr/bin/env node
/**
 * The CI pipeline, and the only definition of it.
 *
 * WHY THIS FILE EXISTS. Before it, the pipeline was written down twice: once as the ordered list of
 * steps in `.github/workflows/ci.yml`, and once as the `npm run` chain in the README. Two copies of
 * a check list drift in one direction only — a check gets added to the place the author was looking
 * at, and the other copy silently stops being the pipeline while continuing to look like it. This
 * file is the single authoritative definition; the workflow and the local Docker runner both invoke
 * it rather than restating it.
 *
 * IT DOES NOT DEFINE THE COMMANDS. The stage list names npm scripts, and the command each one runs
 * is read out of `package.json` at run time. So `package.json` stays the authority on *what a check
 * is*, this file is the authority on *which checks the pipeline runs and in what order*, and
 * neither can quietly disagree with the other: a stage naming a script that does not exist is an
 * invocation error, not a skipped step.
 *
 * ORDER IS LOAD-BEARING, and is inherited unchanged from the workflow this replaced. The invariant
 * checks run before the tests because each guards an assumption the tests rest on: that the series
 * still matches its sources, that quoted prohibitions still say what the source said, and that no
 * rule has been quietly weakened. `check` runs last because it is the only stage that produces a
 * verdict.
 *
 * A SKIPPED STAGE IS A FAILURE, NEVER A PASS. There is no way to ask this script to run a subset.
 * A flag that shortened the pipeline would produce a green result that means something different
 * from the green result the reader assumes, which is the same defect the integrity ratchet exists
 * to prevent one level down.
 *
 * Usage:
 *   node scripts/ci.mjs            run every stage, fail fast
 *   node scripts/ci.mjs --verbose  stream each stage's output even when it passes
 *   node scripts/ci.mjs --json     machine-readable result on stdout
 *
 * Exit 0 only when every stage passed, 1 when any stage failed, 2 on invocation error.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Where the machine-readable result is written. The container gets a writable bind mount here and
 * nowhere else, so this is also the answer to "what is CI allowed to modify": one directory, which
 * is ignored by git.
 */
const EVIDENCE_DIR = process.env.CI_EVIDENCE_DIR
  ? path.resolve(process.env.CI_EVIDENCE_DIR)
  : path.join(ROOT, "artifacts", "local-ci");

/**
 * Read the pipeline out of package.json.
 *
 * The `ci.stages` array is the portable part of this arrangement: `scripts/ci.mjs`, the compose
 * file and the submit-pr harness are repository-agnostic, and adopting all of it in another
 * repository means writing that array and nothing else.
 */
function loadPipeline() {
  const manifestPath = path.join(ROOT, "package.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`package.json could not be read as JSON: ${error.message}`);
  }

  const stages = manifest.ci?.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error(
      "package.json declares no `ci.stages`. A pipeline with no stages would exit 0 having " +
        "verified nothing, which is the failure this pipeline exists to make impossible.",
    );
  }

  const scripts = manifest.scripts ?? {};
  return stages.map((stage) => {
    const name = typeof stage === "string" ? stage : stage?.script;
    if (!name) throw new Error(`a ci.stages entry is not a script name: ${JSON.stringify(stage)}`);
    const command = scripts[name];
    if (!command) {
      throw new Error(
        `ci.stages names the script "${name}", which package.json does not define. The pipeline ` +
          "will not run a subset of itself to route around a missing stage.",
      );
    }
    return { name, command, title: typeof stage === "string" ? name : (stage.title ?? name) };
  });
}

function runStage(stage, { verbose, json }) {
  const startedAt = Date.now();
  const result = spawnSync(stage.command, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    // Under --json a stage may not inherit stdout: the only thing on stdout in that mode is the
    // result document, and a stage that prints into it makes the document unparseable.
    stdio: verbose && !json ? "inherit" : "pipe",
    env: { ...process.env, npm_config_update_notifier: "false" },
  });

  const durationMs = Date.now() - startedAt;

  // A spawn that never launched has no exit code. Treating that as anything other than a failure
  // would convert "the check could not run" into "the check found nothing", which is precisely the
  // conversion the whole repository is built to refuse.
  if (result.error) {
    return { ok: false, durationMs, output: `${stage.command} could not be started: ${result.error.message}` };
  }

  const captured = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const output = verbose && !json ? "" : captured;
  return { ok: result.status === 0, status: result.status, durationMs, output, streamed: verbose && json };
}

function main(argv) {
  const verbose = argv.includes("--verbose");
  const json = argv.includes("--json");

  const unknown = argv.filter((a) => a.startsWith("-") && !["--verbose", "--json"].includes(a));
  if (unknown.length > 0) {
    process.stderr.write(`unknown option: ${unknown.join(", ")}\n`);
    return EXIT_INVOCATION;
  }

  let pipeline;
  try {
    pipeline = loadPipeline();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return EXIT_INVOCATION;
  }

  const startedAt = new Date();
  const checks = [];
  let failed = null;

  // Under --json, stdout carries the result document and nothing else — a consumer piping this to
  // `jq` must not have to strip a banner first. The human narration is still produced; it goes to
  // stderr, where it remains visible on a terminal and out of the way of a parser.
  const say = (text) => (json ? process.stderr : process.stdout).write(text);

  say(`Local CI — ${pipeline.length} stages\n\n`);

  for (const stage of pipeline) {
    say(`>> ${stage.title}\n   ${stage.command}\n`);
    const outcome = runStage(stage, { verbose, json });
    if (outcome.streamed && outcome.output) say(`${outcome.output}\n`);
    checks.push({
      name: stage.name,
      command: stage.command,
      result: outcome.ok ? "passed" : "failed",
      durationMs: outcome.durationMs,
    });

    if (outcome.ok) {
      say(`   PASS (${outcome.durationMs} ms)\n\n`);
      continue;
    }

    say(`   FAIL (${outcome.durationMs} ms)\n`);
    if (outcome.output && !outcome.streamed) say(`${outcome.output}\n`);
    failed = stage.name;
    break; // fail fast: a later stage's result is not information once an earlier one is red
  }

  // Stages after the failure never ran, and are recorded as such rather than omitted. A stage
  // missing from the evidence and a stage that passed must not look the same to a reader.
  for (const stage of pipeline.slice(checks.length)) {
    checks.push({ name: stage.name, command: stage.command, result: "not-run", durationMs: 0 });
  }

  const completedAt = new Date();
  const evidence = {
    repository: process.env.CI_REPOSITORY ?? path.basename(ROOT),
    branch: process.env.CI_BRANCH ?? null,
    commit: process.env.CI_COMMIT ?? null,
    result: failed ? "failed" : "passed",
    environment: process.env.CI_ENVIRONMENT ?? "host",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt - startedAt,
    checks,
  };

  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(path.join(EVIDENCE_DIR, "latest.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  } catch (error) {
    // Evidence that cannot be written must not turn a red run green, nor a green run red on its
    // own: it is reported, and the pipeline result stands on the stages.
    process.stderr.write(`warning: the run evidence could not be written to ${EVIDENCE_DIR}: ${error.message}\n`);
  }

  if (json) process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

  const passedCount = checks.filter((c) => c.result === "passed").length;
  say(
    failed
      ? `Local CI FAILED at stage "${failed}" — ${passedCount} of ${checks.length} stages passed.\n`
      : `Local CI PASSED — ${passedCount} of ${checks.length} stages.\n`,
  );

  return failed ? EXIT_FAILED : EXIT_OK;
}

process.exit(main(process.argv.slice(2)));
