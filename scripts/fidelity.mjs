#!/usr/bin/env node
/**
 * Verify that every block a standard claims is verbatim source actually is.
 *
 * WHY THIS EXISTS. Quoted source text drifts: a backtick added around an identifier, a dash changed,
 * a line reworded to read better. The document goes on claiming the text is reproduced verbatim, and
 * nothing notices. In this pack the hazard is sharper than elsewhere, because the text most often
 * quoted is a prohibition — and a prohibition quietly reworded is the reinterpretation Standard 18
 * forbids. So the claim is made falsifiable and checked on every run.
 *
 * TWO SOURCES. This pack is written from two specs: the domain brief and the standards-system
 * requirements. A claimed quotation must appear in one of them; the report says which. Requiring a
 * document to name its source per quotation would be stricter, but the standards themselves already
 * carry a `Source:` line, and duplicating that per block adds ceremony without adding assurance.
 *
 * WHAT IT CHECKS. Only blocks whose claim is explicit. A standard that says "reproduced verbatim
 * from the source" (or a close variant) immediately before a fenced block, blockquote, or bullet
 * list is asserting something falsifiable; this falsifies it. Authored content makes no such claim
 * and is not checked — the point is to hold the document to its own word, not to forbid original
 * writing.
 *
 * NORMALIZATION. Line wrapping differs between a standard and its source, so both sides are
 * collapsed to single-spaced text before comparison. Backticks, punctuation, and wording are NOT
 * normalized away — those are exactly what this exists to catch.
 *
 * Usage:
 *   node scripts/fidelity.mjs           report, exit 1 on any unverified claim
 *   node scripts/fidelity.mjs --json    machine-readable
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  "artifacts/prompt/original-prompt.md",
  "artifacts/prompt/standards-system-requirements.md",
].map((rel) => ({ rel, abs: path.join(ROOT, rel) }));
const JSON_OUT = process.argv.includes("--json");

/**
 * A sentence asserting that what follows is source text.
 *
 * The last alternative is load-bearing and was added after this check missed a real defect. A
 * document said "…must include the possibility, reproduced verbatim:" and quoted the abstention
 * statement; the phrasing omitted "from the source", so the claim went unrecognised and the quote
 * went unchecked. Rewording that quotation then produced no failure at all.
 *
 * The lesson generalises: a checker that recognises claims by exact phrasing fails open, and it
 * fails open precisely where an author wrote naturally instead of formulaically. So any use of
 * "verbatim" adjacent to a quotation now counts as a claim. The cost is that a passing mention of
 * the word before a fenced block is treated as an assertion, which is a false positive an author
 * can resolve by rewording — the safe direction.
 */
const CLAIM_RE =
  /reproduced\s+(?:verbatim\s+)?from\s+the\s+source|verbatim\s+from\s+the\s+source|from\s+the\s+source[,:]?\s*$|^From the source[,:]|verbatim\s*[,:]\s*$/i;

const normalize = (s) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*>\s?/, "").replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Collect the block immediately following a claim: a fenced block, a blockquote run, or a bullet
 * list. Prose paragraphs are skipped — a claim followed by explanation rather than a quotation is
 * not making a checkable assertion about a specific block.
 */
function blockAfter(lines, start) {
  let i = start;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) return null;

  if (lines[i].trim().startsWith("```")) {
    const body = [];
    i++;
    while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
    return { kind: "fence", text: body.join("\n"), line: start + 1 };
  }
  if (lines[i].trim().startsWith(">")) {
    const body = [];
    while (i < lines.length && (lines[i].trim().startsWith(">") || lines[i].trim() === "")) {
      if (lines[i].trim() === "" && !(lines[i + 1] ?? "").trim().startsWith(">")) break;
      body.push(lines[i++]);
    }
    return { kind: "quote", text: body.join("\n"), line: start + 1 };
  }
  if (/^\s*[-*]\s+/.test(lines[i])) {
    const body = [];
    while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) body.push(lines[i++]);
    return { kind: "list", text: body.join("\n"), line: start + 1 };
  }
  return null;
}

const sources = [];
for (const { rel, abs } of SOURCES) {
  sources.push({ rel, norm: normalize(await readFile(abs, "utf8")) });
}

/** Every Markdown file that may carry a verbatim claim: the standards and the prose documents. */
async function documents() {
  const found = [];
  for (const dir of ["standards", "docs"]) {
    let entries;
    try {
      entries = await readdir(path.join(ROOT, dir), { withFileTypes: true, recursive: true });
    } catch {
      continue; // The directory need not exist yet; a missing document cannot make a false claim.
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const abs = path.join(entry.parentPath ?? entry.path ?? path.join(ROOT, dir), entry.name);
      found.push(path.relative(ROOT, abs).split(path.sep).join("/"));
    }
  }
  return found.sort();
}

const files = await documents();

const failures = [];
let claims = 0;

for (const file of files) {
  const text = await readFile(path.join(ROOT, file), "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!CLAIM_RE.test(lines[i])) continue;
    const block = blockAfter(lines, i + 1);
    if (!block) continue;
    claims++;
    const norm = normalize(block.text);
    if (!norm) continue;
    if (sources.some((s) => s.norm.includes(norm))) continue;

    // Report the first fragment that diverges, so the message points at the actual edit. The source
    // that matched the most is the one the author was most likely quoting, so name it.
    let best = { source: sources[0].rel, longest: "" };
    for (const source of sources) {
      const words = norm.split(" ");
      let longest = "";
      for (let a = 0; a < words.length; a++) {
        for (let b = words.length; b > a; b--) {
          const frag = words.slice(a, b).join(" ");
          if (frag.length > longest.length && source.norm.includes(frag)) longest = frag;
        }
      }
      if (longest.length > best.longest.length) best = { source: source.rel, longest };
    }
    const cut = best.longest ? norm.indexOf(best.longest) + best.longest.length : 0;
    failures.push({
      file,
      line: block.line,
      kind: block.kind,
      nearestSource: best.source,
      diverges: norm.slice(cut, cut + 120).trim() || norm.slice(0, 120),
      claimed: norm.slice(0, 160),
    });
  }
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ claims, failures, ok: failures.length === 0 }, null, 2) + "\n");
  process.exit(failures.length === 0 ? 0 : 1);
}

const out = [
  `Documents scanned:       ${files.length}`,
  `Verbatim claims checked: ${claims}`,
  `Unverified claims:       ${failures.length}`,
  "",
];
for (const f of failures) {
  out.push(`! ${f.file}:${f.line} (${f.kind})`);
  out.push(`    claimed verbatim: ${f.claimed}${f.claimed.length >= 160 ? "…" : ""}`);
  out.push(`    nearest source:   ${f.nearestSource}`);
  out.push(`    diverges at:      ${f.diverges}`);
  out.push("");
}
if (failures.length > 0) {
  out.push("A block claimed as source text does not appear in either source. The usual cause is");
  out.push("formatting added to the quotation — backticks around an identifier, a changed dash, a");
  out.push("reworded line. Reproduce the source exactly, or drop the verbatim claim.");
} else {
  out.push(`Every block claimed as source text appears in ${SOURCES.map((s) => s.rel).join(" or ")}.`);
}
process.stdout.write(out.join("\n") + "\n");
process.exit(failures.length === 0 ? 0 : 1);
