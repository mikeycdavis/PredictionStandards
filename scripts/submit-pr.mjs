#!/usr/bin/env node
/**
 * Submit a pull request for a commit that has actually been verified.
 *
 * THE INVARIANT THIS ENFORCES:
 *
 *     The commit pushed for a pull request is exactly the commit that passed the complete local
 *     Docker CI pipeline.
 *
 * "Exactly" is the whole content of the claim, and it is where this kind of tool usually leaks.
 * Running CI and then pushing is not the same as pushing what CI verified: a pipeline takes
 * minutes, an editor autosaves, a hook amends, a rebase lands, and the branch that reaches the
 * remote is a commit no check ever saw — while the transcript still shows a green run immediately
 * above a successful push. Nothing about that sequence looks wrong afterwards, which is exactly why
 * it needs a guard rather than a convention.
 *
 * Three checks close it, and all three are necessary:
 *
 *   1. The working tree must be clean BEFORE the run. CI verifies the tree that is mounted into the
 *      container, so a dirty tree means CI verified something that is not the commit. This is not
 *      hygiene; it is what makes "the tree" and "the commit" the same object for the duration.
 *   2. HEAD is captured before the run and compared after it. A different value means the verified
 *      commit is not the current one, and the run's result belongs to a commit nobody is proposing.
 *   3. The push names the SHA rather than the branch — `git push origin <sha>:refs/heads/<branch>`.
 *      Pushing the branch would push whatever the branch points at now; pushing the SHA can only
 *      publish the object that was verified, even if something moved the ref in the last second.
 *
 * WHAT IT WILL NOT DO. It never commits, stages, stashes or amends anything to make the pipeline
 * pass — a tool that edits the tree to reach green is manufacturing the result it reports. And it
 * never pushes after a failed or unverified run, which is the only reason the report on the pull
 * request is worth reading.
 *
 * THE LOGIC IS EXPORTED SEPARATELY FROM THE EFFECTS. The predicates below are pure and are pinned
 * by test/local-ci.test.mjs, which runs inside the pipeline this file invokes. The guard is
 * therefore tested by the thing it guards, rather than demonstrated once by hand and trusted after.
 *
 * Usage:
 *   node scripts/submit-pr.mjs [--base <branch>] [--title <text>] [--body <text>]
 *                              [--draft] [--dry-run] [--verbose]
 *
 * Exit 0 when the pull request was created (or already existed), 1 when verification refused, 2 on
 * invocation error.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Branches nothing may be submitted from, whatever the base happens to be. */
export const PROTECTED_BRANCHES = new Set(["main", "master", "HEAD"]);

export const MESSAGES = {
  ciFailed: "CI failed. No branch was pushed and no PR was created.",
  shaChanged:
    "HEAD changed after CI verification. The current commit has not been verified. " +
    "Re-run CI before submitting.",
};

// ---------------------------------------------------------------------------------------------
// The predicates. Pure, exported, and tested.
// ---------------------------------------------------------------------------------------------

/**
 * A branch is submittable when it is a real branch, is not one of the protected ones, and is not
 * the base it would be merged into. The last case matters because `--base` is configurable: with a
 * `--base develop`, submitting *from* `develop` is a pull request from a branch to itself.
 */
export function checkBranch(branch, { base = "main" } = {}) {
  if (!branch) {
    return { ok: false, reason: "HEAD is not on a branch — a detached HEAD has no branch to push." };
  }
  if (PROTECTED_BRANCHES.has(branch)) {
    return {
      ok: false,
      reason: `refusing to submit from "${branch}". Pull requests are opened from a feature branch; ` +
        "pushing the default branch directly is the thing this workflow exists to avoid.",
    };
  }
  if (branch === base) {
    return { ok: false, reason: `the current branch and the base are both "${branch}".` };
  }
  return { ok: true };
}

/**
 * The tree must be clean, and untracked files count.
 *
 * An untracked file is not in the commit, but it IS in the bind mount CI reads, so it can change
 * the pipeline's result — a stray fixture or a leftover scratch file can make a red pipeline green.
 * Treating untracked files as clean would leave the verified result depending on something the
 * commit does not contain, which is the exact gap this whole script exists to close.
 */
export function checkTree(porcelain) {
  const entries = String(porcelain ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (entries.length === 0) return { ok: true };
  return {
    ok: false,
    reason:
      `the working tree has ${entries.length} uncommitted change(s). CI verifies the tree that is ` +
      "mounted into the container, so a dirty tree means the pipeline would certify something " +
      "other than the commit being pushed. Commit or stash first:\n  " +
      entries.slice(0, 10).join("\n  ") +
      (entries.length > 10 ? `\n  ... and ${entries.length - 10} more` : ""),
  };
}

/**
 * The exact-commit check. Deliberately a plain string comparison over full 40-character SHAs: an
 * abbreviated comparison would pass on a prefix collision, and a "starts with" would pass on one by
 * construction.
 */
export function verifyUnchanged(before, after) {
  if (!before || !after) {
    return { ok: false, reason: `${MESSAGES.shaChanged}\n  HEAD could not be resolved on both sides of the run.` };
  }
  if (before !== after) {
    return {
      ok: false,
      reason: `${MESSAGES.shaChanged}\n  verified: ${before}\n  current:  ${after}`,
    };
  }
  return { ok: true };
}

/**
 * Compose the pull request body.
 *
 * The verification block is APPENDED. Whatever the author wrote is kept verbatim and first, because
 * a tool that overwrites the human's description to make room for its own receipt has decided its
 * bookkeeping matters more than the explanation of the change.
 *
 * The wording names the local Docker pipeline and says what did not run. Writing "CI passed" here
 * would let a reader carry over what that phrase means on a hosted runner — a fresh clone on
 * someone else's machine — and this is not that. It is a run on the author's workstation, and the
 * report should be readable as such by someone who was not there.
 */
export function prBody(userBody, verification) {
  const { commit, branch, image, stages = [], completedAt } = verification;
  const block = [
    "## Local CI",
    "",
    `- **Verified commit:** \`${commit}\``,
    `- **Branch:** \`${branch}\``,
    "- **Result:** PASS",
    `- **Environment:** Docker — \`${image}\``,
    `- **Stages:** ${stages.join(" → ")}`,
    `- **Completed:** ${completedAt}`,
    "",
    "The commit pushed here is exactly the commit that passed the pipeline: the tree was clean",
    "before the run, `HEAD` was re-checked after it, and the push named the SHA rather than the",
    "branch.",
    "",
    "_This is a local Docker run on the author's machine, verified by `scripts/submit-pr.ps1`._",
    "_It is not a GitHub-hosted Actions result and makes no claim about one._",
  ].join("\n");

  const written = String(userBody ?? "").trim();
  return written ? `${written}\n\n---\n\n${block}\n` : `${block}\n`;
}

// ---------------------------------------------------------------------------------------------
// The effects.
// ---------------------------------------------------------------------------------------------

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return { status: result.status, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim() };
}

export function parseArgs(argv) {
  const options = { base: "main", title: null, body: null, draft: false, dryRun: false, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case "--base": options.base = next(); break;
      case "--title": options.title = next(); break;
      case "--body": options.body = next(); break;
      case "--draft": options.draft = true; break;
      case "--dry-run": options.dryRun = true; break;
      case "--verbose": options.verbose = true; break;
      default: throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

/** The local CI command for this platform. Windows gets the PowerShell runner, everything else sh. */
function ciCommand(verbose) {
  const flags = verbose ? ["--verbose"] : [];
  if (process.platform === "win32") {
    return {
      command: "pwsh",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, "scripts", "ci.ps1"), ...flags],
      fallback: { command: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, "scripts", "ci.ps1"), ...flags] },
    };
  }
  return { command: path.join(ROOT, "scripts", "ci.sh"), args: flags };
}

function runCi(verbose) {
  const { command, args, fallback } = ciCommand(verbose);
  let result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.error && fallback) {
    result = spawnSync(fallback.command, fallback.args, { cwd: ROOT, stdio: "inherit" });
  }
  if (result.error) {
    process.stderr.write(`the local CI command could not be started: ${result.error.message}\n`);
    return 2;
  }
  return result.status ?? 1;
}

function readEvidence() {
  const file = path.join(ROOT, "artifacts", "local-ci", "latest.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function refuse(message) {
  process.stderr.write(`\n${message}\n`);
  return EXIT_REFUSED;
}

export function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return EXIT_INVOCATION;
  }

  // ---- 1. a git repository ---------------------------------------------------------------
  const inRepo = git(["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  if (inRepo.status !== 0 || inRepo.stdout !== "true") {
    return refuse("this is not a git repository (or not inside its work tree).");
  }

  // ---- 2. a branch that may be submitted from ---------------------------------------------
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true }).stdout;
  const branchCheck = checkBranch(branch, { base: options.base });
  if (!branchCheck.ok) return refuse(branchCheck.reason);

  // ---- 3. a clean tree ---------------------------------------------------------------------
  const treeCheck = checkTree(git(["status", "--porcelain"]).stdout);
  if (!treeCheck.ok) return refuse(treeCheck.reason);

  // ---- 4. the commit under verification ----------------------------------------------------
  const verifiedSha = git(["rev-parse", "HEAD"]).stdout;
  process.stdout.write(`\nSubmitting ${branch} -> ${options.base}\n  commit under verification: ${verifiedSha}\n`);

  // ---- 5. the pipeline ---------------------------------------------------------------------
  const ciStatus = runCi(options.verbose);
  if (ciStatus !== 0) return refuse(MESSAGES.ciFailed);

  // ---- 6. the same commit ------------------------------------------------------------------
  const currentSha = git(["rev-parse", "HEAD"]).stdout;
  const unchanged = verifyUnchanged(verifiedSha, currentSha);
  if (!unchanged.ok) return refuse(unchanged.reason);

  // The tree is re-checked too. A clean tree that went dirty during the run leaves HEAD untouched,
  // so the SHA comparison alone would not notice — and the pipeline's result would then describe a
  // tree that no longer exists.
  const treeAfter = checkTree(git(["status", "--porcelain"]).stdout);
  if (!treeAfter.ok) {
    return refuse(`the working tree changed during verification.\n${treeAfter.reason}`);
  }

  const evidence = readEvidence();
  if (!evidence || evidence.result !== "passed" || (evidence.commit && evidence.commit !== verifiedSha)) {
    return refuse(
      "the run evidence at artifacts/local-ci/latest.json is missing, unreadable, or describes a " +
        `different commit. Expected a passing run for ${verifiedSha}.`,
    );
  }

  if (options.dryRun) {
    process.stdout.write(
      `\nDry run — verification passed and nothing was pushed.\n  would push: ${verifiedSha} -> refs/heads/${branch}\n`,
    );
    return EXIT_OK;
  }

  // ---- 7. push the SHA, not the branch -----------------------------------------------------
  process.stdout.write(`\n>> pushing ${verifiedSha} to refs/heads/${branch}\n`);
  const push = spawnSync("git", ["push", "origin", `${verifiedSha}:refs/heads/${branch}`], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (push.status !== 0) return refuse("the push failed. No PR was created.");
  git(["branch", `--set-upstream-to=origin/${branch}`, branch], { allowFailure: true });

  // ---- 8. the pull request ------------------------------------------------------------------
  // `gh` uses the developer's own authenticated session. No token is read, written, stored or
  // passed by this script, and none belongs in the repository.
  const gh = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (gh.error || gh.status !== 0) {
    process.stdout.write(
      `\nPushed the verified commit. GitHub CLI is not available, so no PR was created.\n` +
        `Open one against ${options.base} from ${branch} when convenient.\n`,
    );
    return EXIT_OK;
  }

  const body = prBody(options.body, {
    commit: verifiedSha,
    branch,
    image: evidence.environment === "docker" ? readImage() : evidence.environment,
    stages: evidence.checks.filter((c) => c.result === "passed").map((c) => c.name),
    completedAt: evidence.completedAt,
  });

  const args = ["pr", "create", "--base", options.base, "--head", branch, "--body", body];
  if (options.title) args.push("--title", options.title);
  else args.push("--fill");
  if (options.draft) args.push("--draft");

  const created = spawnSync("gh", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  process.stdout.write(created.stdout ?? "");
  if (created.status !== 0) {
    const stderr = created.stderr ?? "";
    process.stderr.write(stderr);
    if (/already exists/i.test(stderr)) {
      process.stdout.write("\nThe verified commit was pushed to the existing pull request.\n");
      return EXIT_OK;
    }
    return refuse("the verified commit was pushed, but the PR could not be created.");
  }

  process.stdout.write(`\nSubmitted. Verified commit ${verifiedSha} is the commit on the pull request.\n`);
  return EXIT_OK;
}

function readImage() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).ci.image;
  } catch {
    return "docker";
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
