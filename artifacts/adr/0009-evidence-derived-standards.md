# 0009 — A standard may be derived from adoption evidence, and the inventory records which

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** project owner

## Context

Every standard in the 1.0.0 series traces to a source specification: Standards 1–17 to the domain
brief's `Required standards` list in its own order, Standard 18 to the standards-system
specification's integrity invariant. `scripts/inventory.mjs` extracts both from the sources on every
run and compares the result against the committed, human-reviewed
`artifacts/standards-source-inventory.json`. That comparison is the guarantee that a parser cannot
redefine how many standards exist.

Standard 19 has no source bullet. It exists because three adoptions produced a record that satisfies
every rule in the pack while being incapable of being wrong, and neither source anticipated that
failure. The evidence is real and independently replicated; the provenance is different in kind.

Two bad options presented themselves. **Invent a source bullet** — write the requirement into
`artifacts/prompt/original-prompt.md` so the extraction finds it. That is falsifying the record of
what the sources said, and it is the manipulation Standard 18 exists to forbid; the fact that the
new requirement is *good* makes it more tempting, not less. **Fold falsifiability into Standard 1**
— its `subject` block already carries the resolution fields, so no inventory change would be needed.
Rejected on the merits: defining a probability and establishing that its outcome was open are
different properties, and burying the second inside the first is exactly the "must not be buried in
documentation" failure the standards-system specification names. It would also have been a decision
made to avoid touching a mechanism, which is the wrong reason to shape a normative series.

## Decision

**A standard may be derived from adoption evidence, and the inventory records its origin explicitly.**

Each entry in `artifacts/standards-source-inventory.json` gains `origin`:

- `"source"` — extracted from a specification. Compared positionally and verbatim against the
  extraction, exactly as before. Standards 1–18.
- `"evidence"` — derived from the adoption programme. Not present in any source, so not compared
  against the extraction. It must carry `derivedFrom`, a path to the committed artifact that
  disposed of it, and that file must exist. Standard 19.

`scripts/inventory.mjs` compares the source-derived entries against the extraction as a contiguous
prefix and requires every evidence-derived entry to declare a `derivedFrom` that resolves on disk. A
standard cannot become evidence-derived by accident: the origin is written by hand into a
human-reviewed file that no script regenerates, and flipping one from `source` to `evidence` would
drop it out of the positional comparison and be visible in the diff.

Prohibitions are unaffected and remain 19, all source-derived. Standard 19 introduces **no new
prohibition and no `forbidden`-level rule**, because the 19↔19 mapping between source prohibitions
and forbidden rules is enforced in both directions by `catalog.test.mjs` and a forbidden rule with no
source prohibition would break it. That constraint is worth keeping: it means every must-never in
this pack is one a source actually stated.

## Consequences

- The series can grow from what adoption teaches, without the growth being disguised as something a
  source said.
- A reader of the inventory can see, per standard, whether the requirement was specified or learned.
  That distinction is useful independently of this mechanism: an evidence-derived standard has a
  named artifact behind it, and can be argued with by producing better evidence.
- The extraction guarantee is unchanged for the 18 source-derived standards. The check that catches
  a miscounting parser still runs against exactly the entries a parser produces.
- The bar for a future evidence-derived standard is the one this release set: independent
  replication across adopters, a disposition that survived its counterexamples, and a committed
  review artifact. `derivedFrom` makes that bar checkable rather than remembered.
- Nothing prevents a later source specification from stating a requirement this pack already derived
  from evidence. If that happens, the entry's origin changes to `source` and it joins the positional
  comparison — a deliberate, reviewable edit, like every other change to that file.
