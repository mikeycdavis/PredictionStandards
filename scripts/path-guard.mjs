/**
 * Path identity for the `--resolution` collision guard.
 *
 * WHY THIS IS NOT STRING COMPARISON. Every earlier round of this guard compared canonical path
 * STRINGS and then had to be patched for the next way two strings can name one thing: `..`,
 * symlinks, a `..name` child, junctions, Windows case, a dangling link's textual target, a
 * case-insensitive volume on a platform that is "case-sensitive by name". The class is closed by
 * reducing the guard to two primitives, and routing every guarded input through them:
 *
 *   (a) IDENTITY. A path that exists is identified by (dev, ino) after the filesystem has resolved
 *       it. Two names for one file, however they were reached, have one identity.
 *   (b) CASE PROBE. A path that does not exist yet (a policy candidate, a dangling link's backing
 *       name, the output itself) is identified by the identity of its nearest existing ancestor
 *       plus the remaining names, and those names are compared with the case rules OF THAT
 *       DIRECTORY, found by probing it, never by platform name. When it cannot be probed the guard
 *       assumes case-insensitive: it can only over-refuse, never under-refuse.
 *
 * Resolution is done here by hand rather than with realpath because realpath cannot resolve a
 * path whose tail does not exist, and a dangling symlink is exactly such a path: the run will
 * follow it, and creating its target makes it a record.
 *
 * WHAT THIS DOES NOT CLAIM
 *   - Hard links: an output that is a second name for an input is refused when it already exists
 *     (same identity); an input that is hard-linked to something outside the guarded set is not
 *     found, which is harmless because the write is a rename and never changes an inode another
 *     name shares.
 *   - Races: the answer is true at the moment of the check. The write itself is a temp file plus
 *     rename, so a destination that changes afterwards is replaced, not followed.
 *   - Mounts that change case rules beneath one directory, or a volume that is case-insensitive
 *     in only some subtrees: the probe is per directory, so the directory the names live in is
 *     the one that is asked.
 */

import { lstatSync, readdirSync, readlinkSync, statSync } from "node:fs";
import path from "node:path";

const MAX_HOPS = 40;

const idOf = (stat) => `${stat.dev}:${stat.ino}`;

const BS = String.fromCharCode(92);

function invalid(message) {
  const error = new Error(message);
  error.code = "EINVAL";
  return error;
}

/**
 * Join a base directory and a possibly relative name WITHOUT normalising. path.join and
 * path.resolve collapse `..` lexically, which is wrong whenever the component before it is a
 * symlink or does not exist; the only normalisation allowed anywhere in this module is
 * resolveLocation's, which follows the filesystem.
 */
function joinRaw(base, name) {
  return base.endsWith(path.sep) ? base + name : base + path.sep + name;
}

/** A path a USER supplied for a file: a trailing separator names a directory, which is not one. */
function assertFilePath(raw) {
  if (typeof raw !== "string" || raw === "") throw invalid("empty path");
  if (raw.endsWith("/") || (process.platform === "win32" && raw.endsWith(BS))) {
    throw invalid(`${raw} names a directory, not a file`);
  }
}

function split(raw) {
  if (typeof raw !== "string" || raw === "") throw invalid("empty path");
  if (process.platform === "win32" && /^[A-Za-z]:/.test(raw) && raw[2] !== "/" && raw[2] !== BS) {
    throw invalid(`${raw} is drive-relative; its meaning depends on a per-drive current directory`);
  }
  const abs = path.isAbsolute(raw) ? raw : joinRaw(process.cwd(), raw);
  const { root } = path.parse(abs);
  const names = abs
    .slice(root.length)
    .split(process.platform === "win32" ? /[\\/]+/ : /\/+/)
    .filter((n) => n !== "" && n !== ".");
  return { root, names };
}

/**
 * Where `p` really is: the deepest part that exists (resolved through every symlink, including a
 * dangling one's textual target), and the names after it that do not exist yet.
 * Throws on anything other than "does not exist" (EACCES, ELOOP...): the caller fails closed.
 */
export function resolveLocation(p, { directory = false } = {}) {
  if (!directory) assertFilePath(p);
  let { root, names } = split(p);
  let cur = root;
  let hops = 0;
  const rest = [];
  while (names.length > 0) {
    const name = names.shift();
    if (name === "..") {
      cur = path.dirname(cur);
      continue;
    }
    const next = path.join(cur, name);
    let st;
    try {
      st = lstatSync(next);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        // The OS fails on `missing/..`, so no tail with a parent step is a location at all.
        // Collapsing it would give the guard and the writer two different answers.
        if (names.includes("..")) throw invalid(`${p} steps through a component that does not exist`);
        rest.push(name, ...names);
        names = [];
        break;
      }
      throw error;
    }
    if (st.isSymbolicLink()) {
      if (++hops > MAX_HOPS) {
        const error = new Error(`too many symbolic links resolving ${p}`);
        error.code = "ELOOP";
        throw error;
      }
      const target = readlinkSync(next);
      const abs = path.isAbsolute(target) ? target : joinRaw(cur, target);
      const parts = split(abs);
      cur = parts.root;
      names = [...parts.names, ...names];
      continue;
    }
    cur = next;
  }
  return { anchor: cur, id: idOf(statSync(cur, { bigint: false })), rest };
}

/** Identities of `location.anchor` and every directory above it. */
function ancestorIds(location) {
  const ids = new Set([location.id]);
  let dir = location.anchor;
  for (;;) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    try {
      ids.add(idOf(statSync(dir)));
    } catch {
      break;
    }
  }
  return ids;
}

const swapCase = (s) => [...s].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join("");
const probeCache = new Map();

/**
 * Does `dir` fold case? Asked of the directory by looking up an existing entry under its
 * case-swapped name and comparing identities, never by platform. Unknown means "yes": a guard that
 * folds case it did not need to can only refuse more.
 */
export function directoryFoldsCase(dir) {
  if (probeCache.has(dir)) return probeCache.get(dir);
  let answer = null;
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    names = [];
  }
  for (const name of names) {
    const alt = swapCase(name);
    if (alt === name) continue;
    try {
      const original = statSync(path.join(dir, name));
      let other;
      try {
        other = statSync(path.join(dir, alt));
      } catch (error) {
        if (error?.code === "ENOENT") {
          answer = false;
          break;
        }
        continue;
      }
      answer = idOf(other) === idOf(original);
      break;
    } catch {
      continue;
    }
  }
  if (answer === null) {
    // No entry with letters to ask about: ask about the directory itself, through its parent.
    const base = path.basename(dir);
    const alt = swapCase(base);
    if (base && alt !== base) {
      try {
        const own = statSync(dir);
        try {
          answer = idOf(statSync(path.join(path.dirname(dir), alt))) === idOf(own);
        } catch (error) {
          if (error?.code === "ENOENT") answer = false;
        }
      } catch {
        // fall through to the conservative default
      }
    }
  }
  const result = answer === null ? true : answer;
  probeCache.set(dir, result);
  return result;
}

const sameName = (a, b, folds) => a === b || (folds && a.toLowerCase() === b.toLowerCase());

/** Same place? Identity when both exist; anchor identity plus names under the anchor's case rules. */
export function sameLocation(a, b, folds = directoryFoldsCase) {
  if (a.id !== b.id) return false;
  if (a.rest.length !== b.rest.length) return false;
  if (a.rest.length === 0) return true;
  const f = folds(a.anchor);
  return a.rest.every((name, i) => sameName(name, b.rest[i], f));
}

/** Is `out` the directory `dir` itself, or anywhere beneath it? */
export function locationInside(out, dir, folds = directoryFoldsCase) {
  if (dir.rest.length === 0) return ancestorIds(out).has(dir.id);
  if (out.id !== dir.id || out.rest.length < dir.rest.length) return false;
  const f = folds(dir.anchor);
  return dir.rest.every((name, i) => sameName(name, out.rest[i], f));
}

/**
 * The first guarded entry the output collides with, or null. `entries` are
 * `{ p, dir?: boolean, why }`. Throws if any involved path cannot be resolved (fail closed).
 */
export function firstConflict(outPath, entries, { folds = directoryFoldsCase } = {}) {
  const out = resolveLocation(outPath);
  for (const entry of entries) {
    const loc = resolveLocation(entry.p, { directory: entry.dir === true });
    const hit = entry.dir ? locationInside(out, loc, folds) : sameLocation(out, loc, folds);
    if (hit) return entry;
  }
  return null;
}

/**
 * The path a write to `p` will really create or replace: every directory component resolved
 * physically (so `link/..` is the link target's parent, as the OS reads it, not a lexical
 * collapse), and the final name left alone so a symlink AT that name is still seen as one.
 */
export function physicalDestination(p) {
  assertFilePath(p);
  const { root, names } = split(p);
  const last = names.pop();
  if (last === undefined || last === "..") throw invalid(`${p} does not name a file`);
  const parent = resolveLocation(root + names.join(path.sep));
  // parent.rest holds no ".." (resolveLocation refuses it), so this join normalises nothing: it
  // only concatenates, which is why the writer and the guard cannot disagree about the location.
  return path.join(parent.anchor, ...parent.rest, last);
}
