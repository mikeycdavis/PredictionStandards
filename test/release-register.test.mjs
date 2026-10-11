/**
 * ADR 0012 falsifiers A1-A16, plus the decisions recorded on ST-27 (#60).
 *
 * RED-FIRST. Every test below was written and observed to fail before `scripts/release-register.mjs`,
 * `artifacts/release-register.json` and the `--resolution` flag existed. The module is imported
 * through a guard so that a missing implementation fails each test with its own reason rather than
 * failing the whole file at import time.
 *
 * TWO LAYERS, deliberately:
 *   - the unit layer drives `resolveVersion` against catalogs loaded through the real loader from
 *     edited COPIES of `rules/`, so "a rule changed in place" is an actual file edit, not a mock;
 *   - the CLI layer copies the pack to a temporary directory, edits that copy, and runs its own
 *     `scripts/predictions.mjs`, so the register is read from the pack root of the copy.
 *
 * The 12 policy fixtures that declare 1.0.0 are exercised only in-process through `checkPolicy`
 * and are left alone: resolution lives in `loadPolicy`, which they never reach.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalog } from "../scripts/catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AS_OF = "2026-08-09T12:00:00Z";
const REGISTER_FILE = path.join(ROOT, "artifacts/release-register.json");

let mod = null;
try {
  mod = await import("../scripts/release-register.mjs");
} catch {
  mod = null;
}
const need = () => {
  assert.ok(mod, "scripts/release-register.mjs does not exist yet");
  return mod;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const tmpDirs = [];
function scratch(prefix = "ps-resolve-") {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

const VERSION = readFileSync(path.join(ROOT, "VERSION"), "utf8").trim();

/** A copy of the pack: just what the CLI reads, rooted where its own `scripts/` lives. */
function makePack({ mutateRule, deleteRule, register, noRegister = false, rulesTransform } = {}) {
  const dir = scratch("ps-pack-");
  for (const entry of ["scripts", "rules", "schemas", "examples", "VERSION", "project-policy.yml"]) {
    cpSync(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  if (!noRegister) {
    if (register === undefined) {
      cpSync(REGISTER_FILE, path.join(dir, "artifacts/release-register.json"));
    } else {
      writeFileSync(path.join(dir, "artifacts/release-register.json"), JSON.stringify(register, null, 2));
    }
  }
  if (mutateRule || deleteRule || rulesTransform) editRules(path.join(dir, "rules"), { mutateRule, deleteRule, rulesTransform });
  return dir;
}

/** Edit rule files in place. `mutateRule(rule)` returns true to mark a rule edited. */
function editRules(rulesDir, { mutateRule, deleteRule, rulesTransform }) {
  for (const file of readdirSync(rulesDir).filter((f) => f.endsWith(".json"))) {
    const p = path.join(rulesDir, file);
    const doc = JSON.parse(readFileSync(p, "utf8"));
    if (rulesTransform) rulesTransform(doc, file);
    if (deleteRule) doc.rules = doc.rules.filter((r) => r.id !== deleteRule);
    if (mutateRule) for (const r of doc.rules) mutateRule(r);
    writeFileSync(p, JSON.stringify(doc, null, 2));
  }
}

function catalogDir({ mutateRule, deleteRule, rulesTransform } = {}) {
  const dir = scratch("ps-rules-");
  cpSync(path.join(ROOT, "rules"), path.join(dir, "rules"), { recursive: true });
  editRules(path.join(dir, "rules"), { mutateRule, deleteRule, rulesTransform });
  return path.join(dir, "rules");
}

function policyWith(dir, version) {
  const src = readFileSync(path.join(ROOT, "project-policy.yml"), "utf8");
  assert.match(src, /standardVersion: "1\.2\.0"/);
  const file = path.join(dir, `policy-${String(version).replace(/[^0-9a-z.]/gi, "_")}.yml`);
  writeFileSync(file, src.replace(/standardVersion: "1\.2\.0"/, `standardVersion: "${version}"`));
  return file;
}

function run(packDir, args) {
  const result = spawnSync(process.execPath, [path.join(packDir, "scripts/predictions.mjs"), ...args], {
    cwd: packDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Run check/explain/status/audit against a pack with a declared version; return exit + document. */
function runDeclared({ pack = ROOT, version, command = "check", target, extra = [] }) {
  const out = scratch("ps-out-");
  const policy = policyWith(out, version);
  const resolutionFile = path.join(out, "resolution.json");
  const result = run(pack, [
    command,
    target ?? path.join(pack, "examples/records"),
    `--policy=${policy}`,
    `--as-of=${AS_OF}`,
    `--resolution=${resolutionFile}`,
    ...extra,
  ]);
  const doc = existsSync(resolutionFile) ? JSON.parse(readFileSync(resolutionFile, "utf8")) : null;
  return { ...result, doc, raw: existsSync(resolutionFile) ? readFileSync(resolutionFile, "utf8") : null };
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function readRegister() {
  return JSON.parse(readFileSync(REGISTER_FILE, "utf8"));
}

/** A hash of every file under a directory, excluding .git — used to prove nothing was written. */
function treeHash(dir) {
  const lines = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (name === ".git" || name === "node_modules" || name === "local-ci") continue;
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else lines.push(`${path.relative(dir, p)} ${sha256(readFileSync(p))}`);
    }
  };
  walk(dir);
  return sha256(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// the register file itself
// ---------------------------------------------------------------------------

test("the register exists, names a digest scheme, and records the three releases with provenance", () => {
  assert.ok(existsSync(REGISTER_FILE), "artifacts/release-register.json is missing");
  const register = readRegister();
  assert.equal(register.digestScheme, need().DIGEST_SCHEME);
  assert.deepEqual(Object.keys(register.releases).sort(), ["1.0.0", "1.1.0", "1.2.0"]);

  const r100 = register.releases["1.0.0"].provenance;
  assert.equal(r100.source, "commit-range");
  assert.equal(r100.commits, "999c34d..e7ab219");
  assert.equal(r100.rulesTree, "c702426ddba45fab3b7fd0cf847cd1622c8b7ed9");
  assert.equal(r100.tag, null, "1.0.0 has no tag and none is to be created; the absence is explicit");

  for (const [version, commit] of [
    ["1.1.0", "ebe232bb52cd4b97b5ff3d53c52d6fd344fa3159"],
    ["1.2.0", "898347a2f89b2d4286bb371ba73f0545d2b50bae"],
  ]) {
    const p = register.releases[version].provenance;
    assert.equal(p.source, "tag");
    assert.equal(p.tag, `v${version}`);
    assert.equal(p.commit, commit);
    assert.equal(p.rulesTree, "417fca89bf516c8ce2eb80fb8cfa70be90c45dc8");
  }
});

test("the register records the current VERSION, so a release cannot be cut without an entry", () => {
  assert.ok(readRegister().releases[VERSION], `no register entry for VERSION ${VERSION}`);
});

test("every recorded digest is a 64-hex sha256, and the id sets are 50, 52, 52", () => {
  const { releases } = readRegister();
  const counts = Object.fromEntries(
    Object.entries(releases).map(([v, entry]) => [v, Object.keys(entry.rules).length]),
  );
  assert.deepEqual(counts, { "1.0.0": 50, "1.1.0": 52, "1.2.0": 52 });
  for (const entry of Object.values(releases)) {
    for (const digest of Object.values(entry.rules)) assert.match(digest, /^[0-9a-f]{64}$/);
  }
});

test("the current catalog reproduces the recorded 1.2.0 and 1.1.0 digests (same rules tree)", async () => {
  const m = need();
  const digests = m.catalogDigests(await loadCatalog());
  const { releases } = readRegister();
  assert.deepEqual(digests, releases["1.2.0"].rules);
  assert.deepEqual(digests, releases["1.1.0"].rules);
});

test("1.0.0, 1.1.0 and 1.2.0 entries reproduce from their git trees when the objects are present", async (t) => {
  const m = need();
  const have = (rev) => spawnSync("git", ["cat-file", "-e", rev], { cwd: ROOT }).status === 0;
  const { releases } = readRegister();
  for (const [version, rev] of [
    ["1.0.0", "c702426ddba45fab3b7fd0cf847cd1622c8b7ed9"],
    ["1.1.0", "417fca89bf516c8ce2eb80fb8cfa70be90c45dc8"],
    ["1.2.0", "417fca89bf516c8ce2eb80fb8cfa70be90c45dc8"],
  ]) {
    if (!have(rev)) {
      t.diagnostic(`git object ${rev} not present; skipped ${version}`);
      continue;
    }
    const dir = scratch("ps-tree-");
    const archive = spawnSync("git", ["archive", rev], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(archive.status, 0);
    mkdirSync(path.join(dir, "rules"));
    const tar = spawnSync("tar", ["-x"], { cwd: path.join(dir, "rules"), input: archive.stdout });
    assert.equal(tar.status, 0, String(tar.stderr));
    const digests = m.catalogDigests(await loadCatalog(path.join(dir, "rules")));
    assert.deepEqual(digests, releases[version].rules, `${version} entry does not reproduce from ${rev}`);
  }
});

// ---------------------------------------------------------------------------
// the digest (decision 3)
// ---------------------------------------------------------------------------

const DIGEST_FIELDS = [
  "title",
  "description",
  "appliesTo",
  "assurance",
  "validationType",
  "attestable",
  "introducedIn",
  "deprecatedIn",
  "supersededBy",
  "removedIn",
  "aliases",
  "remediation",
  "level",
  "severity",
  "nonExemptible",
];
const EXCLUDED_FIELDS = ["source", "rationale", "standard", "category", "$assuranceNote"];

async function aRule() {
  const catalog = await loadCatalog();
  return { ...catalog.rules.get("falsifiability.declared") ?? [...catalog.rules.values()][0] };
}

test("the digest field set is exactly the approved one", () => {
  assert.deepEqual([...need().DIGEST_FIELDS].sort(), [...DIGEST_FIELDS].sort());
});

test("every approved field moves the digest", async () => {
  const m = need();
  const rule = await aRule();
  const base = m.ruleDigest(rule);
  const alt = {
    title: "x",
    description: "x",
    appliesTo: rule.appliesTo === "any" ? "prediction" : "any",
    assurance: rule.assurance === "full" ? "none" : "full",
    validationType: rule.validationType === "structural" ? "document" : "structural",
    attestable: !rule.attestable,
    introducedIn: "9.0.0",
    deprecatedIn: "1.9.0",
    supersededBy: "x.y",
    removedIn: "2.0.0",
    aliases: [...rule.aliases, "legacy.zz-alias"],
    remediation: "x",
    level: rule.level === "required" ? "optional" : "required",
    severity: rule.severity === "error" ? "info" : "error",
    nonExemptible: !rule.nonExemptible,
  };
  for (const field of DIGEST_FIELDS) {
    assert.notEqual(m.ruleDigest({ ...rule, [field]: alt[field] }), base, `${field} does not move the digest`);
  }
});

test("excluded fields do not move the digest, and that is recorded rather than discovered", async () => {
  const m = need();
  const rule = await aRule();
  const base = m.ruleDigest(rule);
  for (const field of EXCLUDED_FIELDS) {
    assert.equal(
      m.ruleDigest({ ...rule, [field]: `changed ${field}` }),
      base,
      `${field} moved the digest but is outside the approved set`,
    );
  }
});

test("the digest is a function of the digest fields only: an unknown extra key is ignored", async () => {
  const m = need();
  const rule = await aRule();
  assert.equal(m.ruleDigest({ ...rule, somethingNew: 1 }), m.ruleDigest(rule));
});

test("effective values: an explicit default and the absent form digest identically", async () => {
  const m = need();
  const absent = catalogDir({
    rulesTransform: (doc) => doc.rules.forEach((r) => (delete r.appliesTo, delete r.attestable)),
  });
  const explicit = catalogDir({
    rulesTransform: (doc) =>
      doc.rules.forEach((r) => {
        r.appliesTo = "any";
        r.attestable = r.validationType === "manual-review";
      }),
  });
  assert.deepEqual(m.catalogDigests(await loadCatalog(absent)), m.catalogDigests(await loadCatalog(explicit)));
  // and a non-default explicit value is a real change
  const flipped = catalogDir({
    rulesTransform: (doc) => doc.rules.forEach((r) => (r.attestable = !(r.validationType === "manual-review"))),
  });
  assert.notDeepEqual(m.catalogDigests(await loadCatalog(absent)), m.catalogDigests(await loadCatalog(flipped)));
});

test("canonicalisation: key order, CRLF line endings and alias order do not move digests", async () => {
  const m = need();
  const base = m.catalogDigests(await loadCatalog());
  const reordered = catalogDir({});
  const crlf = catalogDir({});
  for (const file of readdirSync(reordered).filter((f) => f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(path.join(reordered, file), "utf8"));
    doc.rules = doc.rules.map((r) => Object.fromEntries(Object.entries(r).reverse()));
    writeFileSync(path.join(reordered, file), JSON.stringify(doc, null, 2));
    const text = readFileSync(path.join(crlf, file), "utf8").replace(/\r?\n/g, "\r\n");
    writeFileSync(path.join(crlf, file), text);
  }
  assert.deepEqual(m.catalogDigests(await loadCatalog(reordered)), base);
  assert.deepEqual(m.catalogDigests(await loadCatalog(crlf)), base);
  const rule = await aRule();
  assert.equal(
    m.ruleDigest({ ...rule, aliases: ["b.two", "a.one"] }),
    m.ruleDigest({ ...rule, aliases: ["a.one", "b.two"] }),
  );
});

// ---------------------------------------------------------------------------
// the print-only helper (decision 2)
// ---------------------------------------------------------------------------

function helper(args, cwd = ROOT) {
  return spawnSync(process.execPath, [path.join(ROOT, "scripts/release-register.mjs"), ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("the helper prints a candidate entry that equals the committed 1.2.0 digests, and writes nothing", () => {
  const before = treeHash(ROOT);
  const r = helper(["print", "--version=1.2.0"]);
  assert.equal(r.status, 0, r.stderr);
  const printed = JSON.parse(r.stdout);
  assert.equal(printed.digestScheme, need().DIGEST_SCHEME);
  assert.deepEqual(printed.releases["1.2.0"].rules, readRegister().releases["1.2.0"].rules);
  assert.equal(treeHash(ROOT), before, "the helper changed the working tree");
});

test("the helper has no write mode: --write is an unknown flag, exit 2, and nothing changes", () => {
  const before = treeHash(ROOT);
  const r = helper(["print", "--version=1.2.0", "--write"]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.equal(treeHash(ROOT), before);
});

test("the helper's source imports no write primitive", () => {
  const src = readFileSync(path.join(ROOT, "scripts/release-register.mjs"), "utf8");
  for (const forbidden of ["writeFile", "appendFile", "createWriteStream", "mkdir", "rename", "unlink", "rmSync", "copyFile"]) {
    assert.ok(!src.includes(forbidden), `scripts/release-register.mjs references ${forbidden}`);
  }
});

// ---------------------------------------------------------------------------
// resolveVersion, unit layer
// ---------------------------------------------------------------------------

async function resolve(declared, { dir, register } = {}) {
  const m = need();
  const catalog = await loadCatalog(dir);
  return m.resolveVersion({
    declared,
    catalog,
    register: register ?? readRegister(),
    packVersion: VERSION,
  });
}

test("A1 the current version resolves", async () => {
  const doc = await resolve("1.2.0");
  assert.equal(doc.resolved, true);
  assert.equal(doc.outcome, "RESOLVED");
  assert.deepEqual(doc.failed, []);
  assert.equal(doc.e1.status, "holds");
  assert.equal(doc.e2.status, "holds");
  assert.equal(doc.e3.status, "holds");
});

test("A2 a legitimate pin to 1.1.0 resolves: equality is not the rule", async () => {
  const doc = await resolve("1.1.0");
  assert.equal(doc.resolved, true);
  assert.deepEqual(doc.failed, []);
  assert.notEqual(doc.declaredVersion, doc.packVersion);
});

test("A3 1.0.0 fails E3 only: E1 and E2 hold, the change was additive", async () => {
  const doc = await resolve("1.0.0");
  assert.equal(doc.resolved, false);
  assert.equal(doc.outcome, "NOT_EVALUATED");
  assert.deepEqual(doc.failed, ["E3"]);
  assert.equal(doc.e1.status, "holds");
  assert.equal(doc.e2.status, "holds", "E2 must not be blamed for an E3 fault");
  assert.equal(doc.e3.status, "fails");
  assert.deepEqual(doc.e3.reasons, ["rule-newer-than-declared"]);
  assert.deepEqual(doc.e3.offending.map((o) => o.introducedIn), ["1.1.0", "1.1.0"]);
});

test("A4 9.9.9 fails E1 and E2/E3 are reported as not attempted", async () => {
  const doc = await resolve("9.9.9");
  assert.deepEqual(doc.failed, ["E1"]);
  assert.equal(doc.e1.status, "fails");
  assert.equal(doc.e2.status, "not-attempted");
  assert.equal(doc.e3.status, "not-attempted");
});

test("A6 the bound is catalog-wide: an unfired newer rule still fails E3", async () => {
  const m = need();
  // One rule claims to have been introduced in 1.2.0. The register is regenerated from that
  // catalog so E2 holds; E3 is then the only thing that can object, and no record is involved.
  const dir = catalogDir({
    mutateRule: (r) => {
      if (r.id === "falsifiability.declared") r.introducedIn = "1.2.0";
    },
  });
  const catalog = await loadCatalog(dir);
  const register = {
    digestScheme: m.DIGEST_SCHEME,
    releases: { "1.1.0": { provenance: {}, rules: m.catalogDigests(catalog) }, "1.2.0": { provenance: {}, rules: m.catalogDigests(catalog) } },
  };
  const doc = m.resolveVersion({ declared: "1.1.0", catalog, register, packVersion: "1.2.0" });
  assert.deepEqual(doc.failed, ["E3"]);
  assert.equal(doc.e2.status, "holds");
  assert.deepEqual(doc.e3.offending, [{ id: "falsifiability.declared", introducedIn: "1.2.0" }]);
});

test("A7 the bound is computed from the catalog, not a literal", async () => {
  const m = need();
  const real = m.introductionBound(await loadCatalog());
  assert.equal(real, "1.1.0");
  const raised = catalogDir({
    mutateRule: (r) => {
      if (r.id === "falsifiability.declared") r.introducedIn = "1.7.3";
    },
  });
  assert.equal(m.introductionBound(await loadCatalog(raised)), "1.7.3");
  const lowered = catalogDir({ mutateRule: (r) => (r.introducedIn = "1.0.0") });
  assert.equal(m.introductionBound(await loadCatalog(lowered)), "1.0.0");
  // Version ordering is numeric, not lexical.
  const ten = catalogDir({
    mutateRule: (r) => {
      if (r.id === "falsifiability.declared") r.introducedIn = "1.10.0";
    },
  });
  assert.equal(m.introductionBound(await loadCatalog(ten)), "1.10.0");
});

test("A10 a rule revised in place fails E2 while every introducedIn is unchanged", async () => {
  const dir = catalogDir({
    mutateRule: (r) => {
      if (r.id === "falsifiability.declared") r.severity = r.severity === "error" ? "warning" : "error";
    },
  });
  const doc = await resolve("1.1.0", { dir });
  assert.equal(doc.resolved, false);
  assert.deepEqual(doc.failed, ["E2"]);
  assert.equal(doc.e2.status, "changed");
  assert.deepEqual(doc.e2.mismatched, ["falsifiability.declared"]);
  assert.equal(doc.e3.status, "holds", "introducedIn did not move, so E3 holds; E2 caught it alone");
});

test("A11 VERSION is not exempt: an empty register does not resolve the current version", async () => {
  const m = need();
  const doc = m.resolveVersion({
    declared: VERSION,
    catalog: await loadCatalog(),
    register: { digestScheme: m.DIGEST_SCHEME, releases: {} },
    packVersion: VERSION,
  });
  assert.equal(doc.resolved, false);
  assert.deepEqual(doc.failed, ["E1"]);
  const absent = m.resolveVersion({
    declared: VERSION,
    catalog: await loadCatalog(),
    register: null,
    registerState: "missing",
    packVersion: VERSION,
  });
  assert.deepEqual(absent.failed, ["E1"]);
  assert.deepEqual(absent.e1.reasons, ["register-missing"]);
});

test("A9 1.1.1 lies between two real releases and names none: E1", async () => {
  const doc = await resolve("1.1.1");
  assert.deepEqual(doc.failed, ["E1"]);
  assert.deepEqual(doc.e1.reasons, ["not-in-register"]);
});

test("A12 the three failures are separately identifiable, with distinct codes", async () => {
  const e1 = await resolve("1.1.1");
  const e3 = await resolve("1.0.0");
  const e2 = await resolve("1.1.0", {
    dir: catalogDir({ mutateRule: (r) => r.id === "falsifiability.declared" && (r.level = "optional") }),
  });
  assert.deepEqual([e1.failed, e2.failed, e3.failed], [["E1"], ["E2"], ["E3"]]);
  const codes = [e1.e1.reasons[0], e2.e2.reasons[0], e3.e3.reasons[0]];
  assert.equal(new Set(codes).size, 3, `codes collide: ${codes}`);
});

test("A13 the current catalog edited in place fails E2 with a digest mismatch", async () => {
  const dir = catalogDir({
    mutateRule: (r) => {
      if (r.id === "falsifiability.declared") r.remediation = `${r.remediation} (edited)`;
    },
  });
  const doc = await resolve("1.2.0", { dir });
  assert.deepEqual(doc.failed, ["E2"]);
  assert.equal(doc.e2.status, "changed");
  assert.deepEqual(doc.e2.reasons, ["digest-mismatch"]);
  assert.deepEqual(doc.e2.mismatched, ["falsifiability.declared"]);
});

test("A14 absent evidence is unanswerable, not a mismatch", async () => {
  const m = need();
  for (const entry of [{ provenance: {} }, { provenance: {}, rules: {} }]) {
    const doc = m.resolveVersion({
      declared: "1.2.0",
      catalog: await loadCatalog(),
      register: { digestScheme: m.DIGEST_SCHEME, releases: { "1.2.0": entry } },
      packVersion: "1.2.0",
    });
    assert.equal(doc.resolved, false);
    assert.deepEqual(doc.failed, ["E2"]);
    assert.equal(doc.e2.status, "unanswerable");
    assert.deepEqual(doc.e2.reasons, ["no-digest-recorded"]);
    assert.deepEqual(doc.e2.mismatched, [], "missing evidence must not be reported as a measured change");
    assert.deepEqual(doc.e2.removed, []);
  }
});

test("a digest scheme the code does not recognise makes E2 unanswerable, not changed", async () => {
  const m = need();
  const doc = m.resolveVersion({
    declared: "1.2.0",
    catalog: await loadCatalog(),
    register: { digestScheme: "some-other-scheme", releases: readRegister().releases },
    packVersion: "1.2.0",
  });
  assert.deepEqual(doc.failed, ["E2"]);
  assert.equal(doc.e2.status, "unanswerable");
  assert.deepEqual(doc.e2.reasons, ["digest-scheme-unrecognised"]);
});

test("a recorded id with an unusable digest is unanswerable for that id, never a mismatch", async () => {
  const m = need();
  const releases = structuredClone(readRegister().releases);
  const id = Object.keys(releases["1.2.0"].rules)[0];
  releases["1.2.0"].rules[id] = null;
  const doc = m.resolveVersion({
    declared: "1.2.0",
    catalog: await loadCatalog(),
    register: { digestScheme: m.DIGEST_SCHEME, releases },
    packVersion: "1.2.0",
  });
  assert.equal(doc.e2.status, "unanswerable");
  assert.deepEqual(doc.e2.unanswerable, [id]);
  assert.deepEqual(doc.e2.mismatched, []);
});

test("A16 a rule recorded for the release and deleted from the catalog is named", async () => {
  const dir = catalogDir({ deleteRule: "falsifiability.declared" });
  const doc = await resolve("1.2.0", { dir });
  assert.deepEqual(doc.failed, ["E2"]);
  assert.deepEqual(doc.e2.removed, ["falsifiability.declared"]);
  assert.ok(doc.e2.reasons.includes("rule-removed"));
});

test("E2 is restricted to the recorded ids: a rule added since the declared release is not an E2 fault", async () => {
  const doc = await resolve("1.1.0", {
    register: (() => {
      const r = structuredClone(readRegister());
      const ids = Object.keys(r.releases["1.1.0"].rules);
      delete r.releases["1.1.0"].rules[ids[0]];
      return r;
    })(),
  });
  assert.equal(doc.e2.status, "holds");
});

// ---------------------------------------------------------------------------
// CLI layer
// ---------------------------------------------------------------------------

test("A1 CLI: the repository's own 1.2.0 policy resolves and evaluation proceeds", () => {
  const r = runDeclared({ version: "1.2.0" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.doc.resolved, true);
  assert.equal(r.doc.declaredVersion, "1.2.0");
  assert.match(r.stdout, /SUPPORTED/);
});

test("A2 CLI: 1.1.0 resolves", () => {
  const r = runDeclared({ version: "1.1.0" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.doc.resolved, true);
});

test("A3 CLI: 1.0.0 is NOT_EVALUATED, exit 2, E3 only, and publishes no verdict", () => {
  const r = runDeclared({ version: "1.0.0", extra: ["--json"] });
  assert.equal(r.status, 2);
  assert.deepEqual(r.doc.failed, ["E3"]);
  assert.equal(r.doc.e2.status, "holds");
  assert.equal(r.stdout, "", "no report on stdout: resolution happens before any record is read");
  assert.match(r.stderr, /E3/);
  assert.doesNotMatch(r.stderr, /\bE2\b/, "E2 must not be blamed for an E3 fault");
});

test("A4 CLI: 9.9.9 is NOT_EVALUATED, exit 2, E1", () => {
  const r = runDeclared({ version: "9.9.9", extra: ["--json"] });
  assert.equal(r.status, 2);
  assert.deepEqual(r.doc.failed, ["E1"]);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /E1/);
});

test("A5 CLI: the malformed 1.2 is still refused at load, exit 2, empty stdout, no resolution attempted", () => {
  const r = runDeclared({ version: "1.2", extra: ["--json"] });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /not valid/);
  assert.match(r.stderr, /standardVersion/);
  assert.equal(r.doc.attempted, false);
  assert.equal(r.doc.resolved, false);
  assert.equal(r.doc.reason, "policy-invalid");
});

test("A8 CLI: an unresolvable version is never a rule finding and never exit 1, on every command", () => {
  for (const version of ["1.0.0", "9.9.9", "1.1.1"]) {
    for (const command of ["check", "explain", "status"]) {
      const r = runDeclared({ version, command });
      assert.equal(r.status, 2, `${command} ${version}: exit ${r.status}`);
      assert.doesNotMatch(r.stdout + r.stderr, /INSUFFICIENTLY_SUPPORTED/);
      assert.equal(r.doc.outcome, "NOT_EVALUATED");
    }
  }
});

test("A9 CLI: 1.1.1 is E1", () => {
  const r = runDeclared({ version: "1.1.1" });
  assert.equal(r.status, 2);
  assert.deepEqual(r.doc.failed, ["E1"]);
  assert.deepEqual(r.doc.e1.reasons, ["not-in-register"]);
});

test("A10 CLI: a rule revised in place under a 1.1.0 pin is E2 changed, exit 2", () => {
  const pack = makePack({
    mutateRule: (r) => {
      if (r.id === "falsifiability.declared") r.severity = r.severity === "error" ? "warning" : "error";
    },
  });
  const r = runDeclared({ pack, version: "1.1.0" });
  assert.equal(r.status, 2);
  assert.deepEqual(r.doc.failed, ["E2"]);
  assert.equal(r.doc.e2.status, "changed");
  assert.match(r.stderr, /E2/);
});

test("A11 CLI: with the register missing, or empty, a policy declaring VERSION does not resolve", () => {
  for (const pack of [makePack({ noRegister: true }), makePack({ register: { digestScheme: need().DIGEST_SCHEME, releases: {} } })]) {
    const r = runDeclared({ pack, version: VERSION });
    assert.equal(r.status, 2, r.stderr);
    assert.deepEqual(r.doc.failed, ["E1"]);
  }
});

test("a register that is not JSON is E1 (unreadable), exit 2, never a pass", () => {
  const pack = makePack({ noRegister: true });
  writeFileSync(path.join(pack, "artifacts/release-register.json"), "{ not json");
  const r = runDeclared({ pack, version: VERSION });
  assert.equal(r.status, 2);
  assert.deepEqual(r.doc.failed, ["E1"]);
  assert.deepEqual(r.doc.e1.reasons, ["register-unreadable"]);
});

test("A12 CLI: three faults, three different failed lists and reason codes in the document", () => {
  const e1 = runDeclared({ version: "9.9.9" });
  const e3 = runDeclared({ version: "1.0.0" });
  const e2 = runDeclared({
    pack: makePack({ mutateRule: (r) => r.id === "falsifiability.declared" && (r.nonExemptible = !r.nonExemptible) }),
    version: "1.2.0",
  });
  assert.deepEqual([e1.doc.failed, e2.doc.failed, e3.doc.failed], [["E1"], ["E2"], ["E3"]]);
  assert.equal(new Set([e1.raw, e2.raw, e3.raw]).size, 3);
});

test("A13 CLI: the current catalog edited in place, VERSION and register untouched, is E2", () => {
  const pack = makePack({
    mutateRule: (r) => {
      if (r.id === "falsifiability.declared") r.title = `${r.title} (edited)`;
    },
  });
  const r = runDeclared({ pack, version: "1.2.0" });
  assert.equal(r.status, 2);
  assert.deepEqual(r.doc.failed, ["E2"]);
  assert.deepEqual(r.doc.e2.reasons, ["digest-mismatch"]);
});

test("A14 CLI: a register that names the release without digests is E2 unanswerable", () => {
  const register = readRegister();
  register.releases["1.2.0"] = { provenance: register.releases["1.2.0"].provenance };
  const r = runDeclared({ pack: makePack({ register }), version: "1.2.0" });
  assert.equal(r.status, 2);
  assert.equal(r.doc.e2.status, "unanswerable");
  assert.deepEqual(r.doc.e2.mismatched, []);
});

test("A15 CLI: resolution is identical against a full, a partial and an empty target", () => {
  const empty = scratch("ps-empty-");
  const partial = scratch("ps-partial-");
  cpSync(path.join(ROOT, "examples/records/supported-prediction.json"), path.join(partial, "supported-prediction.json"));
  for (const version of ["1.2.0", "1.0.0", "9.9.9"]) {
    const docs = [path.join(ROOT, "examples/records"), partial, empty].map(
      (target) => runDeclared({ version, target }),
    );
    assert.ok(docs.every((d) => d.doc), `${version}: no resolution document was written`);
    // The document names the policy path, which differs between the three scratch folders; compare
    // everything else byte for byte.
    const strip = (d) => JSON.stringify({ ...d.doc, policy: undefined });
    assert.equal(strip(docs[1]), strip(docs[0]), `${version}: partial target differs from full`);
    assert.equal(strip(docs[2]), strip(docs[0]), `${version}: empty target differs from full`);
    if (version !== "1.2.0") {
      assert.deepEqual(docs.map((d) => d.status), [2, 2, 2], `${version}: an empty target resolved a rejected declaration`);
      for (const d of docs) assert.match(d.stderr, /did not resolve/, `${version}: exit 2 without the resolution fault being the reason`);
    }
  }
});

test("A16 CLI: a recorded rule deleted from the catalog is E2, naming the id", () => {
  const pack = makePack({ deleteRule: "falsifiability.declared" });
  const r = runDeclared({ pack, version: "1.2.0" });
  assert.equal(r.status, 2);
  assert.deepEqual(r.doc.e2.removed, ["falsifiability.declared"]);
});

test("A6 CLI: an unfired newer rule fails E3 against an empty target too", () => {
  const m = need();
  const pack = makePack({
    mutateRule: (r) => {
      if (r.id === "falsifiability.declared") r.introducedIn = "1.2.0";
    },
  });
  // Regenerate the register from the edited catalog so only E3 can object.
  const printed = spawnSync(process.execPath, [path.join(pack, "scripts/release-register.mjs"), "print", "--version=1.1.0"], {
    cwd: pack,
    encoding: "utf8",
  });
  assert.equal(printed.status, 0, printed.stderr);
  const entry = JSON.parse(printed.stdout);
  writeFileSync(
    path.join(pack, "artifacts/release-register.json"),
    JSON.stringify({ digestScheme: m.DIGEST_SCHEME, releases: { "1.1.0": entry.releases["1.1.0"] } }),
  );
  const empty = scratch("ps-empty-");
  const r = runDeclared({ pack, version: "1.1.0", target: empty });
  assert.equal(r.status, 2);
  assert.deepEqual(r.doc.failed, ["E3"]);
});

// ---------------------------------------------------------------------------
// transport and byte stability
// ---------------------------------------------------------------------------

test("without --resolution, no file is written and stdout is byte-identical to the unflagged run", () => {
  const policy = path.join(ROOT, "project-policy.yml");
  const base = [`check`, path.join(ROOT, "examples/records"), `--policy=${policy}`, `--as-of=${AS_OF}`, "--json"];
  const a = run(ROOT, base);
  const out = scratch("ps-out-");
  const b = run(ROOT, [...base, `--resolution=${path.join(out, "r.json")}`]);
  assert.equal(a.status, 0);
  assert.equal(b.stdout, a.stdout, "the --resolution flag changed check --json stdout");
  assert.ok(existsSync(path.join(out, "r.json")));
});

test("the resolution document names its own schema version and kind", () => {
  const r = runDeclared({ version: "1.2.0" });
  assert.equal(r.doc.kind, "standard-version-resolution");
  assert.match(r.doc.resolutionSchemaVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(r.doc.digestScheme, need().DIGEST_SCHEME);
});

// ---------------------------------------------------------------------------
// audit: established exit codes preserved, failure carried distinctly
// ---------------------------------------------------------------------------

test("audit keeps exit 0 (even --strict) for an unresolvable version, and says so distinctly", () => {
  for (const version of ["9.9.9", "1.0.0", "1.1.1"]) {
    for (const strict of [[], ["--strict"]]) {
      const r = runDeclared({ command: "audit", version, extra: strict });
      assert.equal(r.status, 0, `audit ${version} ${strict}: exit ${r.status}`);
      assert.equal(r.doc.resolved, false);
      assert.equal(r.doc.outcome, "NOT_EVALUATED");
      assert.match(r.stderr, /did not resolve/i, "audit exited 0 with no sign the declaration was unresolved");
      assert.match(r.stdout, /did not resolve/i, "the readable audit output reads as a success");
    }
  }
});

test("audit --json stdout is unchanged by resolution failure (the report schema is closed)", () => {
  const good = runDeclared({ command: "audit", version: "1.2.0", extra: ["--json"] });
  const bad = runDeclared({ command: "audit", version: "9.9.9", extra: ["--json"] });
  const strip = (s) => JSON.stringify({ ...JSON.parse(s), policy: undefined });
  assert.equal(strip(bad.stdout), strip(good.stdout));
  assert.equal(good.status, 0);
  assert.equal(bad.status, 0);
  assert.doesNotMatch(good.stderr, /did not resolve/i);
});

test("audit with a malformed policy still exits 0 and carries 'not attempted' distinctly", () => {
  const r = runDeclared({ command: "audit", version: "1.2" });
  assert.equal(r.status, 0);
  assert.equal(r.doc.attempted, false);
  assert.equal(r.doc.resolved, false);
  assert.match(r.stderr, /not (attempted|resolved)|did not resolve/i);
});

test("audit with a resolvable version says nothing extra", () => {
  const r = runDeclared({ command: "audit", version: "1.2.0" });
  assert.equal(r.status, 0);
  assert.equal(r.doc.resolved, true);
  assert.doesNotMatch(r.stdout + r.stderr, /did not resolve/i);
});
