/**
 * Diagram freshness.
 *
 * The .mmd is canonical; the fenced copy in the Markdown is derived. A derived copy that no longer
 * matches its source is a diagram that lies, and it lies in the most convincing way — it renders
 * perfectly and describes an architecture that no longer exists.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

const normalize = (text) =>
  text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();

test("the embedded diagram matches its Mermaid source exactly", async () => {
  const source = await read("docs/architecture.mmd");
  // Normalize before matching, not after: on Windows these files carry CRLF, and a regex anchored
  // on "```mermaid\n" silently finds nothing rather than failing loudly. scripts/diagrams.mjs
  // normalizes for the same reason, and a test that did not would pass while checking nothing.
  const document = normalize(await read("docs/architecture.md"));
  const fence = /```mermaid\n([\s\S]*?)```/.exec(document);
  assert.ok(fence, "docs/architecture.md carries no mermaid fence");
  assert.equal(normalize(fence[1]), normalize(source));
});

test("the architecture document says the .mmd is canonical", async () => {
  // Without this line the next editor patches the fence, which is the drift the check exists to stop.
  const document = await read("docs/architecture.md");
  assert.match(document, /canonical/i);
  assert.match(document, /architecture\.mmd/);
});

test("the diagram names the pieces the architecture actually has", async () => {
  const source = await read("docs/architecture.mmd");
  for (const piece of ["records.mjs", "compliance.mjs", "predictions.mjs", "integrity.mjs", "BLOCKED_BY_INVARIANT"]) {
    assert.ok(source.includes(piece), `the diagram never mentions ${piece}`);
  }
});
