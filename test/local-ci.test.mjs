/**
 * The guard on the submission workflow, tested by the pipeline it guards.
 *
 * The invariant under test:
 *
 *     The commit pushed for a pull request is exactly the commit that passed the complete local
 *     Docker CI pipeline.
 *
 * Demonstrating that once, by hand, would prove it held on one afternoon. These arms run on every
 * `npm run ci`, which is to say inside the container, before every push — so the guard is checked
 * by the mechanism that depends on it rather than trusted after a single showing.
 *
 * The SHA-mismatch case is asserted here rather than staged against the real repository on purpose.
 * Reproducing it for real means moving a branch during a live run, which is a race with history as
 * the thing being raced; the predicate is pure, so the honest test is to call it with two SHAs and
 * assert the refusal.
 *
 * Every arm is paired. A guard is only worth its assertion if the negative case is also pinned:
 * "refuses a dirty tree" is satisfied by a function that refuses everything, and it is the clean
 * tree passing that says the refusal was about dirtiness.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MESSAGES,
  PROTECTED_BRANCHES,
  checkBranch,
  checkTree,
  parseArgs,
  prBody,
  verifyUnchanged,
} from "../scripts/submit-pr.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

const SHA_A = "7d4dca4eedf443d62bca5bd77fe2b1d1047313c4";
const SHA_B = "904d42a1f0b2c3d4e5f60718293a4b5c6d7e8f90";

// -------------------------------------------------------------------------------------------
// The exact-commit invariant
// -------------------------------------------------------------------------------------------

test("a commit that did not move during CI is submittable", () => {
  assert.equal(verifyUnchanged(SHA_A, SHA_A).ok, true);
});

test("a commit that moved during CI is refused, and the message says the current commit is unverified", () => {
  const result = verifyUnchanged(SHA_A, SHA_B);
  assert.equal(result.ok, false);
  assert.match(result.reason, /HEAD changed after CI verification/);
  assert.match(result.reason, /has not been verified/);
  // Both SHAs are reported. "Something changed" without saying what leaves the reader unable to
  // tell an amend from a rebase from a colleague's push.
  assert.match(result.reason, new RegExp(SHA_A));
  assert.match(result.reason, new RegExp(SHA_B));
});

test("the comparison is exact, not a prefix match", () => {
  // A `startsWith` comparison would call these equal, and an abbreviated one would too. Both would
  // pass the arm above while leaving the invariant open.
  const truncated = SHA_A.slice(0, 12);
  assert.equal(verifyUnchanged(SHA_A, truncated).ok, false);
  assert.equal(verifyUnchanged(truncated, SHA_A).ok, false);
});

test("an unresolvable HEAD on either side is a refusal, never a pass", () => {
  // The failure mode this closes: `git rev-parse` returning empty is falsy, and a check written as
  // `if (before !== after)` alone would treat two empty strings as agreement and wave the push
  // through having verified nothing.
  assert.equal(verifyUnchanged("", "").ok, false);
  assert.equal(verifyUnchanged(SHA_A, "").ok, false);
  assert.equal(verifyUnchanged("", SHA_A).ok, false);
});

// -------------------------------------------------------------------------------------------
// The preconditions that make "the tree" and "the commit" the same object
// -------------------------------------------------------------------------------------------

test("a clean tree passes and a dirty one is refused", () => {
  assert.equal(checkTree("").ok, true);
  assert.equal(checkTree("\n").ok, true);

  const dirty = checkTree(" M scripts/ci.mjs\n");
  assert.equal(dirty.ok, false);
  assert.match(dirty.reason, /uncommitted change/);
});

test("untracked files count as dirty, because CI reads the mount rather than the commit", () => {
  // An untracked file is absent from the commit and present in the bind mount, so it can change
  // the pipeline's result. Treating it as clean would leave the verified result resting on
  // something the pushed commit does not contain.
  const result = checkTree("?? test/fixtures/scratch.json\n");
  assert.equal(result.ok, false);
});

test("a feature branch is submittable and a protected one is not", () => {
  assert.equal(checkBranch("chore/local-docker-ci", { base: "main" }).ok, true);

  for (const protectedBranch of PROTECTED_BRANCHES) {
    const result = checkBranch(protectedBranch, { base: "main" });
    assert.equal(result.ok, false, `${protectedBranch} was accepted`);
  }
});

test("a branch equal to its own base is refused, whatever the base is", () => {
  // `--base` is configurable, so this cannot be covered by the protected-branch list alone.
  assert.equal(checkBranch("develop", { base: "develop" }).ok, false);
  assert.equal(checkBranch("develop", { base: "main" }).ok, true);
});

test("a detached HEAD has no branch to push", () => {
  assert.equal(checkBranch("", { base: "main" }).ok, false);
  assert.equal(checkBranch(null, { base: "main" }).ok, false);
});

// -------------------------------------------------------------------------------------------
// What the pull request is allowed to claim
// -------------------------------------------------------------------------------------------

const verification = {
  commit: SHA_A,
  branch: "chore/local-docker-ci",
  image: "node:20-alpine@sha256:abc",
  stages: ["inventory", "test", "check"],
  completedAt: "2026-08-15T23:37:21Z",
};

test("the PR body reports the verified commit and names the environment as local Docker", () => {
  const body = prBody("", verification);
  assert.match(body, new RegExp(SHA_A));
  assert.match(body, /Result:\*\* PASS/);
  assert.match(body, /Docker/);
});

test("the PR body does not claim GitHub Actions passed", () => {
  const body = prBody("Fixes the thing.", verification);
  // The distinction the wording has to survive: a reader skimming the receipt must not come away
  // believing a hosted runner rebuilt this from a clean clone.
  assert.match(body, /not a GitHub-hosted Actions result/);
  assert.ok(
    !/GitHub Actions (passed|succeeded|green)/i.test(body),
    "the body implies a hosted Actions result",
  );
});

test("user-provided body content is kept, and kept first", () => {
  const body = prBody("Fixes the thing.\n\nDetail the reviewer needs.", verification);
  assert.ok(body.startsWith("Fixes the thing."), "the author's description was displaced");
  assert.match(body, /Detail the reviewer needs\./);
  assert.match(body, /## Local CI/);
});

test("an empty body yields the verification block alone rather than a stray separator", () => {
  const body = prBody("   ", verification);
  assert.ok(body.startsWith("## Local CI"));
  assert.ok(!body.includes("---\n\n## Local CI"));
});

// -------------------------------------------------------------------------------------------
// Options, and the ones that must not exist
// -------------------------------------------------------------------------------------------

test("options parse, and an unknown option is an error rather than a silent default", () => {
  assert.deepEqual(parseArgs([]).base, "main");
  assert.equal(parseArgs(["--base", "develop"]).base, "develop");
  assert.equal(parseArgs(["--draft"]).draft, true);
  assert.equal(parseArgs(["--dry-run"]).dryRun, true);
  assert.throws(() => parseArgs(["--force"]), /unknown option/);
  assert.throws(() => parseArgs(["--base"]), /requires a value/);
});

test("neither script offers a way to skip verification or run a subset of the pipeline", async () => {
  // The back door this arrangement exists to close, asserted against the source rather than
  // intended. Any of these would produce a green result that means something other than what the
  // reader assumes — and the first response to a red pipeline would be to reach for one.
  const forbidden = [
    "--skip-ci",
    "--no-ci",
    "--force",
    "--no-verify",
    "--only",
    "--stage",
    "--skip-tests",
  ];
  for (const file of ["scripts/ci.mjs", "scripts/submit-pr.mjs"]) {
    // Comments name several of these as prohibitions; naming one is the point, implementing one is
    // the defect. So the check reads code with the comments stripped.
    const source = (await read(file))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const flag of forbidden) {
      assert.ok(!source.includes(flag), `${file} implements ${flag}`);
    }
  }
});

test("the pipeline definition and the checks package.json declares cannot disagree", async () => {
  const manifest = JSON.parse(await read("package.json"));
  assert.ok(Array.isArray(manifest.ci?.stages) && manifest.ci.stages.length > 0, "ci.stages is empty");
  for (const stage of manifest.ci.stages) {
    assert.ok(manifest.scripts[stage], `ci.stages names "${stage}", which is not an npm script`);
  }
  // The stage list is the pipeline. If a check is added to package.json and not to ci.stages it
  // does not run, so the count is asserted deliberately: changing it should be a decision.
  assert.equal(manifest.ci.stages.length, 8);
});

test("the CI image is pinned by digest in both places that name it", async () => {
  const manifest = JSON.parse(await read("package.json"));
  assert.match(manifest.ci.image, /@sha256:[0-9a-f]{64}$/, "ci.image is not digest-pinned");
  const dockerfile = await read("Dockerfile.ci");
  assert.ok(
    dockerfile.includes(manifest.ci.image),
    "Dockerfile.ci builds from an image other than the one package.json reports",
  );
});
