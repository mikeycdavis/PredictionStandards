/**
 * `predictions init` — scaffold a policy and a template record into a project.
 *
 * THE SAFETY CONTRACT, which is the whole reason this is not three lines of copy:
 *
 *   create     the file does not exist            -> written
 *   preserve   it exists and matches the template -> untouched, so a second run is a no-op
 *   conflict   it exists and differs              -> NOTHING is written, and the run reports it
 *   overwrite  it exists, differs, and this exact -> written
 *              path was named in --force-overwrite
 *
 * Approving one path never approves another. Overwriting is the only destructive thing this command
 * can do, and it requires naming the specific file — a blanket `--force` would make "replace
 * everything" one keystroke away from "replace the one file I meant".
 *
 * DRY-RUN AND APPLY DERIVE FROM THE SAME PLAN. `plan()` computes the actions and writes nothing;
 * `apply()` executes exactly those actions. There is no second traversal that could disagree with
 * the preview, which is what makes the preview trustworthy rather than merely reassuring.
 *
 * Adapted from the engineering-standards bootstrap, minus its mode detection — that command had to
 * decide whether a repository was greenfield or needed reconstruction before scaffolding a plan.
 * Nothing here scaffolds a plan, so the concept was dropped rather than carried across as dead
 * vocabulary.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAMEWORK = path.resolve(HERE, "..");

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

/** What init can create, and where each file's content comes from. */
export const ARTIFACTS = [
  { path: "project-policy.yml", template: "templates/project-policy.yml" },
  { path: "AGENTS.md", template: "templates/AGENTS.md" },
  { path: "CLAUDE.md", template: "templates/CLAUDE.md" },
  { path: "records/example-prediction.json", template: "templates/prediction-record.json" },
];

/**
 * Compute what would happen. Writes nothing.
 *
 * @param root       the project to scaffold into
 * @param overwrite  paths explicitly approved for replacement
 */
export async function plan(root, { overwrite = [] } = {}) {
  const approved = new Set(overwrite);
  const actions = [];

  for (const artifact of ARTIFACTS) {
    const target = path.join(root, artifact.path);
    const content = await readFile(path.join(FRAMEWORK, artifact.template), "utf8");

    if (!existsSync(target)) {
      actions.push({ action: "create", path: artifact.path, bytes: content.length });
      continue;
    }

    const current = await readFile(target, "utf8");
    if (current === content) {
      // Idempotence: a second run finds what the first wrote and leaves it alone.
      actions.push({ action: "preserve", path: artifact.path, reason: "already matches the template" });
      continue;
    }

    if (approved.has(artifact.path)) {
      actions.push({
        action: "overwrite",
        path: artifact.path,
        bytes: content.length,
        reason: "explicitly approved for replacement",
        destructive: true,
      });
      continue;
    }

    actions.push({
      action: "conflict",
      path: artifact.path,
      reason: "exists and differs from the template; nothing was changed",
      remediation: `Review it. To replace it, re-run with --force-overwrite=${artifact.path}.`,
    });
  }

  return {
    schemaVersion: "1.0.0",
    created: actions.filter((a) => a.action === "create").map((a) => a.path),
    preserved: actions.filter((a) => a.action === "preserve").map((a) => a.path),
    overwrites: actions.filter((a) => a.action === "overwrite").map((a) => a.path),
    conflicts: actions.filter((a) => a.action === "conflict"),
    nextStep:
      "Edit project-policy.yml: set parameters from your domain, and define your confidence tiers. Then run `predictions check records/`.",
    actions,
  };
}

/**
 * Execute a plan. The only writing function here.
 *
 * A failure stops the run rather than continuing to the next artifact: a half-written
 * project-policy.yml fails validation in a way that looks like the project's fault.
 */
export async function apply(root, planned) {
  const written = [];
  for (const action of planned.actions) {
    if (action.action !== "create" && action.action !== "overwrite") continue;
    const artifact = ARTIFACTS.find((a) => a.path === action.path);
    const content = await readFile(path.join(FRAMEWORK, artifact.template), "utf8");
    await mkdir(path.dirname(path.join(root, action.path)), { recursive: true });
    await writeFile(path.join(root, action.path), content, "utf8");
    written.push(action.path);
  }
  return written;
}

/** Human-readable rendering of a plan or a completed run. */
export function render(report, { dryRun }) {
  const out = [];
  out.push(dryRun ? "predictions init — dry run, nothing was written" : "predictions init");
  out.push("");

  for (const action of report.actions) {
    if (action.action === "create") out.push(`  create     ${action.path}`);
    else if (action.action === "preserve") out.push(`  preserve   ${action.path}  (${action.reason})`);
    else if (action.action === "overwrite") out.push(`  OVERWRITE  ${action.path}  (${action.reason})`);
    else out.push(`  CONFLICT   ${action.path}  (${action.reason})`);
  }

  const conflicts = report.conflicts;
  if (conflicts.length > 0) {
    out.push("");
    out.push(`  ${conflicts.length} conflict(s). Nothing was written for these.`);
    for (const c of conflicts) out.push(`    ${c.path}: ${c.remediation}`);
  }

  out.push("");
  out.push(`  Next: ${report.nextStep}`);
  if (dryRun) out.push("  Re-run without --dry-run to apply exactly the actions listed above.");
  return out.join("\n");
}

/** Entry point used by predictions.mjs. */
export async function runInit(options) {
  const root = path.resolve(options.target ?? ".");
  let report;
  try {
    report = await plan(root, { overwrite: options.forceOverwrite });
  } catch (error) {
    process.stderr.write(`predictions init: ${error.message}\n`);
    process.exit(EXIT_INVOCATION);
  }

  if (!options.dryRun) {
    try {
      await apply(root, report);
    } catch (error) {
      process.stderr.write(`predictions init: ${error.message}\n`);
      process.exit(EXIT_INVOCATION);
    }
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ ...report, dryRun: options.dryRun, root }, null, 2) + "\n");
  } else {
    process.stdout.write(render(report, { dryRun: options.dryRun }) + "\n");
  }

  // A conflict is not an error — nothing broke, and nothing was written. It is a result the operator
  // has to act on, so it exits 1 rather than 0.
  process.exit(report.conflicts.length > 0 ? EXIT_FINDINGS : EXIT_OK);
}
