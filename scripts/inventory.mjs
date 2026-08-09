#!/usr/bin/env node
/**
 * Prove that the standards series and the prohibition series have not silently changed shape.
 *
 * WHY THIS EXISTS. In the repository this architecture came from, a scan of the source once reported
 * that item 8 did not exist, because every item was written as a bare `N. Title` except item 8, which
 * carried a Markdown heading prefix. The regex found 43 items where there were 44, and that number
 * was written into three documents as a fact about the world. It was a fact about the regex.
 *
 * So the fix is not a better regex. It is that **the inventory is not derived on every run.**
 * `artifacts/standards-source-inventory.json` was reviewed by a human once and committed as the
 * canonical enumeration. This script extracts from the sources and compares the result *against* that
 * file. A parser that becomes more or less forgiving cannot redefine how many standards exist — it
 * can only disagree with the inventory, and disagreeing fails.
 *
 * WHAT IS EXTRACTED. Two bullet lists in the domain brief:
 *   - the items under `## Required standards`  -> standards 1..17, in source order
 *   - the items under `## Must-never rules`    -> prohibitions 1..18, in source order
 * plus one item that is not a bullet at all: the blockquote under the standards-system spec's
 * `## Standards integrity invariant` heading, which becomes Standard 18 and prohibition 19. It is
 * located by its heading rather than by the bullet scan, and the inventory records that difference
 * so the exception is visible rather than hidden inside a regex.
 *
 * A NOTE ON THE PROHIBITION LIST. The must-never bullets are written as continuations of the word
 * "Never:", so each bullet is a bare verb phrase. They are compared verbatim, lowercase and all —
 * a prohibition tidied into a sentence is a prohibition reworded, and Standard 18 forbids that.
 *
 * Usage:
 *   node scripts/inventory.mjs           report, exit 1 on any mismatch
 *   node scripts/inventory.mjs --json    machine-readable
 *
 * No third-party dependencies, matching the rest of scripts/.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY = path.join(ROOT, "artifacts/standards-source-inventory.json");
const JSON_OUT = process.argv.includes("--json");

/**
 * Collect the bullet items directly under a `## Heading`, stopping at the next heading of any level.
 * Deliberately forgiving about the bullet marker and leading whitespace; the comparison below is what
 * catches the consequence of that forgiveness.
 */
function bulletsUnder(sourceText, heading) {
  const lines = sourceText.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return null; // Distinct from "found none": a missing heading is a different fault.
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    const m = /^\s*[-*]\s+(.+?)\s*$/.exec(lines[i]);
    if (m) items.push(m[1]);
  }
  return items;
}

/** Collect the blockquote run directly under a `## Heading`, joined into one line. */
function blockquoteUnder(sourceText, heading) {
  const lines = sourceText.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    const m = /^\s*>\s?(.*)$/.exec(lines[i]);
    if (m) body.push(m[1].trim());
    else if (body.length > 0 && lines[i].trim() === "") break;
  }
  return body.length === 0 ? null : body.join(" ").replace(/\s+/g, " ").trim();
}

const inventory = JSON.parse(await readFile(INVENTORY, "utf8"));
const [domainRel, systemRel] = inventory.sources;
const domain = await readFile(path.join(ROOT, domainRel), "utf8");
const system = await readFile(path.join(ROOT, systemRel), "utf8");

const problems = [];
const note = (message) => problems.push(message);

// --- Standards -------------------------------------------------------------------------------
const requiredBullets = bulletsUnder(domain, "Required standards");
const invariantText = blockquoteUnder(system, "Standards integrity invariant");

if (requiredBullets === null) {
  note(`${domainRel}: no '## Required standards' heading found`);
} else if (invariantText === null) {
  note(`${systemRel}: no blockquote under '## Standards integrity invariant'`);
} else {
  const extracted = [...requiredBullets, "standards integrity"];
  const expected = inventory.standards.map((s) => s.title);

  if (inventory.standards.length !== inventory.expectedCount) {
    note(
      `inventory is internally inconsistent: expectedCount is ${inventory.expectedCount} but it lists ${inventory.standards.length} standards`,
    );
  }
  if (extracted.length !== expected.length) {
    note(`standards: extracted ${extracted.length} from the sources, inventory records ${expected.length}`);
  }
  for (let i = 0; i < Math.max(extracted.length, expected.length); i++) {
    if (extracted[i] !== expected[i]) {
      note(`standard ${i + 1}: source says ${JSON.stringify(extracted[i] ?? null)}, inventory says ${JSON.stringify(expected[i] ?? null)}`);
    }
  }
  for (const [i, s] of inventory.standards.entries()) {
    if (s.number !== i + 1) note(`standard at position ${i + 1} declares number ${s.number}`);
  }
}

// --- Prohibitions ----------------------------------------------------------------------------
const neverBullets = bulletsUnder(domain, "Must-never rules");

if (neverBullets === null) {
  note(`${domainRel}: no '## Must-never rules' heading found`);
} else if (invariantText !== null) {
  const extracted = [...neverBullets, invariantText];
  const expected = inventory.prohibitions.map((p) => p.text);

  if (inventory.prohibitions.length !== inventory.expectedProhibitions) {
    note(
      `inventory is internally inconsistent: expectedProhibitions is ${inventory.expectedProhibitions} but it lists ${inventory.prohibitions.length}`,
    );
  }
  if (extracted.length !== expected.length) {
    note(`prohibitions: extracted ${extracted.length} from the sources, inventory records ${expected.length}`);
  }
  for (let i = 0; i < Math.max(extracted.length, expected.length); i++) {
    if (extracted[i] !== expected[i]) {
      note(`prohibition ${i + 1}: source says ${JSON.stringify(extracted[i] ?? null)}, inventory says ${JSON.stringify(expected[i] ?? null)}`);
    }
  }
  // Every prohibition must name the standard that owns it and the rule that carries it. A
  // prohibition with no rule is one the system states and cannot act on.
  const standardNumbers = new Set(inventory.standards.map((s) => s.number));
  for (const p of inventory.prohibitions) {
    if (!standardNumbers.has(p.standard)) note(`prohibition ${p.number}: standard ${p.standard} is not in the series`);
    if (typeof p.rule !== "string" || p.rule.trim() === "") note(`prohibition ${p.number}: no rule id recorded`);
  }
}

const result = {
  sources: inventory.sources,
  reviewedOn: inventory.reviewedOn,
  standards: inventory.standards.length,
  prohibitions: inventory.prohibitions.length,
  problems,
  ok: problems.length === 0,
};

if (JSON_OUT) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.ok ? 0 : 1);
}

const out = [
  `Sources:      ${inventory.sources.join(", ")}`,
  `Reviewed on:  ${inventory.reviewedOn}`,
  `Standards:    ${inventory.standards.length}`,
  `Prohibitions: ${inventory.prohibitions.length}`,
  "",
];
for (const p of problems) out.push(`! ${p}`);
if (problems.length > 0) {
  out.push("");
  out.push("The sources and the committed inventory disagree. If the sources changed, review the");
  out.push("change and update artifacts/standards-source-inventory.json deliberately. Never");
  out.push("regenerate that file from a run: doing so lets a parser redefine the series in silence.");
} else {
  out.push("The committed inventory matches the sources.");
}
process.stdout.write(out.join("\n") + "\n");
process.exit(result.ok ? 0 : 1);
