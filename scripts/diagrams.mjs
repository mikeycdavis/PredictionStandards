#!/usr/bin/env node
/**
 * Diagram freshness: every `.mmd` must match the copy embedded in Markdown, and any committed
 * `.svg` must have been rendered from the current `.mmd`.
 *
 * Standard 39 R4 requires CI to detect when Mermaid source and generated output are out of sync.
 * ADR 0003 makes the `.mmd` canonical; a rendered `.svg` and an embedded fence are both derived, and
 * a derived copy that no longer matches its source is the exact drift the ADR exists to prevent.
 *
 * The design constraint worth naming: **this check requires no Mermaid toolchain.** It compares
 * text, not pictures. That is what lets a zero-dependency repository enforce the rule at all — a
 * check that needed a headless browser would not run in this CI and the rule would go unenforced.
 *
 * Exit 0 when every diagram is in sync, 1 when any is stale, 2 on invocation error.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules", "fixtures"]);

/** Marker a renderer should embed so an SVG can be traced to the source it came from. */
const SOURCE_HASH_MARKER = /mermaid-source-sha256:\s*([0-9a-f]{64})/i;

async function sha256(text) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalize(text)).digest("hex");
}

/** Compare diagram text by content, not by incidental whitespace or line endings. */
function normalize(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), out);
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function mermaidBlocks(markdown) {
  const blocks = [];
  const pattern = /^```mermaid[ \t]*\r?\n([\s\S]*?)^```/gm;
  let match;
  while ((match = pattern.exec(markdown)) !== null) blocks.push(match[1]);
  return blocks;
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

async function check(root) {
  const files = await walk(root);
  const sources = files.filter((f) => f.endsWith(".mmd"));
  const markdown = files.filter((f) => f.endsWith(".md"));
  const findings = [];

  const embedded = new Map();
  for (const file of markdown) {
    const blocks = mermaidBlocks(await readFile(file, "utf8"));
    if (blocks.length > 0) embedded.set(file, blocks.map(normalize));
  }

  for (const source of sources) {
    const text = normalize(await readFile(source, "utf8"));
    const name = rel(source);

    // 1. The source must appear verbatim as a mermaid fence somewhere in the documentation.
    //
    // Deliberately an exact whole-content match against every block in the tree, with no attempt to
    // pair a .mmd to a particular document. An earlier version matched a host document by comparing
    // first lines and only then checked the rest — so editing the first line (`flowchart TB` to
    // `flowchart LR`) matched no host and the drift was reported as clean. The mutation test caught
    // it. A check whose failure path can be stepped around by the very edit it guards against is
    // worse than no check, because it reports green.
    const allBlocks = [...embedded.values()].flat();
    if (!allBlocks.includes(text)) {
      findings.push({
        file: name,
        message:
          allBlocks.length === 0
            ? "is not embedded in any document"
            : "no embedded copy matches this source — a document is showing a stale diagram",
        remediation: "Re-embed the .mmd verbatim in its document. The .mmd is canonical (ADR 0003).",
      });
    }

    // 2. If a rendered SVG exists beside it, it must record the hash of this source.
    const svg = source.replace(/\.mmd$/, ".svg");
    let svgText = null;
    try {
      await stat(svg);
      svgText = await readFile(svg, "utf8");
    } catch {
      // No render committed. ADR 0003 permits this where the toolchain is unavailable, provided the
      // absence is declared — which is a documentation obligation, not something checkable here.
    }
    if (svgText !== null) {
      const recorded = svgText.match(SOURCE_HASH_MARKER);
      const expected = await sha256(text);
      if (!recorded) {
        findings.push({
          file: rel(svg),
          message: "rendered SVG records no source hash, so it cannot be traced to a .mmd",
          remediation: `Regenerate, embedding a comment: <!-- mermaid-source-sha256: ${expected} -->`,
        });
      } else if (recorded[1].toLowerCase() !== expected) {
        findings.push({
          file: rel(svg),
          message: `rendered SVG is stale — it was generated from a different version of ${name}`,
          remediation: "Regenerate the SVG from the current .mmd.",
        });
      }
    }
  }

  // 3. A hand-authored SVG with no .mmd beside it is what ADR 0003 abolished.
  for (const file of files.filter((f) => f.endsWith(".svg"))) {
    const source = file.replace(/\.svg$/, ".mmd");
    if (!sources.includes(source)) {
      findings.push({
        file: rel(file),
        message: "SVG has no .mmd source",
        remediation:
          "Diagrams are authored in Mermaid and rendered (ADR 0003). If this is not a diagram, move it out of a diagram path.",
      });
    }
  }

  return { sources, embedded, findings };
}

async function main() {
  let result;
  try {
    result = await check(ROOT);
  } catch (error) {
    process.stderr.write(`standards diagrams: ${error.message}\n`);
    process.exit(EXIT_INVOCATION);
  }

  process.stdout.write(`Mermaid sources:  ${result.sources.length}\n`);
  process.stdout.write(`Embedded copies:  ${[...result.embedded.values()].flat().length}\n`);
  process.stdout.write(`Stale diagrams:   ${result.findings.length}\n\n`);

  for (const finding of result.findings) {
    process.stdout.write(`! ${finding.file}\n    ${finding.message}\n    ${finding.remediation}\n\n`);
  }

  if (result.findings.length > 0) {
    process.stdout.write("A derived copy no longer matches its Mermaid source.\n");
    process.exit(EXIT_FINDINGS);
  }
  process.stdout.write("Every diagram matches its Mermaid source.\n");
  process.exit(EXIT_OK);
}

export { check, normalize, mermaidBlocks };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
