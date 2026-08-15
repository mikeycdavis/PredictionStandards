#!/usr/bin/env sh
# Verify the current commit with local Docker CI, then push exactly that commit and open a PR.
#
# A thin wrapper. The logic lives in scripts/submit-pr.mjs — the guard this workflow rests on is
# worth more as tested code than as a shell transcript, and test/local-ci.test.mjs pins it inside
# the pipeline this command runs. A second implementation here would be an untested copy of the
# guard, free to drift from the one with the tests.
#
# Usage: ./scripts/submit-pr.sh [--base <branch>] [--title <text>] [--body <text>]
#                               [--draft] [--dry-run] [--verbose]

set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)

if ! command -v node >/dev/null 2>&1; then
    printf 'node was not found on PATH. The submission harness runs on the host; only the CI pipeline itself is containerised.\n' >&2
    exit 2
fi

exec node "$REPO_ROOT/scripts/submit-pr.mjs" "$@"
