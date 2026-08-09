# Claude Code

Follow [AGENTS.md](AGENTS.md). It carries the load order and the rules; this file holds only the
Claude Code specifics, so the two cannot drift.

## Commands

```bash
npx predictions check records/            # the authoritative verdict
npx predictions explain records/x.json    # why each rule applied, and what was found
npx predictions check records/ --as-of=2026-08-09T12:00:00Z   # pinned, reproducible
```

## When a check fails

Read the rule id, then the `remediation` line. Fix the record or the evidence — not the rule, and not
the threshold.

On `BLOCKED_BY_INVARIANT`: stop and report. See AGENTS.md.
