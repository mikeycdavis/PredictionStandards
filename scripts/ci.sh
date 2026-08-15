#!/usr/bin/env sh
# Run this repository's complete CI pipeline in an ephemeral Docker environment.
#
# The POSIX counterpart of scripts/ci.ps1, and deliberately not a redundant one: the developer
# machine here is Windows, but the hosted workflow runs on Linux and a self-hosted runner would
# too. Both scripts are lifecycle only — build, run, tear down. Neither decides what runs; that is
# scripts/ci.mjs, driven by `ci.stages` in package.json, which is what keeps the two runners from
# drifting into different definitions of a green build.
#
# Exit 0 only when every stage passed.
#
# Usage: ./scripts/ci.sh [--keep-on-failure] [--verbose]

set -eu

KEEP_ON_FAILURE=0
STREAM=""

for arg in "$@"; do
    case "$arg" in
        --keep-on-failure) KEEP_ON_FAILURE=1 ;;
        --verbose)         STREAM="--verbose" ;;
        *)
            printf 'unknown option: %s. Supported: --keep-on-failure, --verbose\n' "$arg" >&2
            exit 2
            ;;
    esac
done

REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
    printf 'docker was not found on PATH. Local CI requires Docker; nothing else needs to be installed.\n' >&2
    exit 2
fi
if ! docker info >/dev/null 2>&1; then
    printf 'the Docker daemon is not reachable. Start Docker and re-run.\n' >&2
    exit 2
fi

# The image digest is written down twice — package.json reports it, Dockerfile.ci builds from it —
# so the two are compared rather than trusted. A report naming an environment other than the one
# that ran is worse than no report.
DECLARED_IMAGE=$(node -p "require('./package.json').ci.image")
if ! grep -q -- "$DECLARED_IMAGE" Dockerfile.ci; then
    printf 'package.json declares ci.image %s but Dockerfile.ci does not build from it.\n' "$DECLARED_IMAGE" >&2
    exit 2
fi

CI_REPOSITORY=$(basename "$REPO_ROOT")
CI_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')
CI_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo '')
CI_IMAGE='predictionstandards-ci:local'
export CI_REPOSITORY CI_BRANCH CI_COMMIT CI_IMAGE

# A project name unique to this run. Every container, network and volume compose creates is
# namespaced under it, which is what makes teardown safe: `down` can only reach resources this run
# created, never a developer's own services or a sibling repository's CI.
PROJECT="predictionstandards-ci-$$-$(date +%s)"
COMPOSE="docker compose -p $PROJECT -f compose.ci.yml"

mkdir -p artifacts/local-ci
rm -f artifacts/local-ci/latest.json

printf '\n=== Local CI =============================================================\n'
printf '  repository   %s\n' "$CI_REPOSITORY"
printf '  branch       %s\n' "${CI_BRANCH:-(not a git checkout)}"
printf '  commit       %s\n' "${CI_COMMIT:-(unknown)}"
printf '  environment  Docker — %s\n' "$DECLARED_IMAGE"
printf '  project      %s\n' "$PROJECT"
printf '==========================================================================\n\n'

EXIT_CODE=1
teardown() {
    if [ "$KEEP_ON_FAILURE" -eq 1 ] && [ "$EXIT_CODE" -ne 0 ]; then
        printf '\nkept for debugging: docker compose -p %s -f compose.ci.yml ps\n' "$PROJECT"
        printf 'tear down with:     docker compose -p %s -f compose.ci.yml down -v --remove-orphans\n' "$PROJECT"
    else
        $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
    fi
}
# Teardown on success, on failure, and on interrupt. No `docker system prune` and no bare
# `docker rm` appears here: everything removed is scoped to this run's project name.
trap teardown EXIT INT TERM

set +e
printf '>> building the CI image\n'
if ! $COMPOSE build; then
    # An image that did not build is not a pipeline that did not pass — it is a pipeline that did
    # not run. Nothing downstream may treat either as green.
    printf 'the CI image could not be built. No stage ran.\n' >&2
    EXIT_CODE=2
else
    # `run --rm` rather than `up`: there is one service and no dependencies to wait for, so the
    # container's exit status is the pipeline's result with nothing in between to lose it. If a
    # dependency with a healthcheck is ever added, an `up --wait` on it belongs here — a sleep
    # never does.
    # shellcheck disable=SC2086
    $COMPOSE run --rm --no-deps ci node scripts/ci.mjs $STREAM
    EXIT_CODE=$?
fi
set -e

printf '\n'
if [ "$EXIT_CODE" -eq 0 ]; then
    printf '=== Local CI PASSED ======================================================\n'
    printf '  repository   %s\n' "$CI_REPOSITORY"
    printf '  branch       %s\n' "$CI_BRANCH"
    printf '  commit       %s\n' "$CI_COMMIT"
    printf '  result       PASS\n'
    printf '  stages       %s\n' "$(node -p "require('./package.json').ci.stages.join(', ')")"
    printf '  environment  Docker — %s\n' "$DECLARED_IMAGE"
    printf '  completed    %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '  evidence     artifacts/local-ci/latest.json\n'
    printf '==========================================================================\n'
else
    printf '=== Local CI FAILED ======================================================\n'
    printf '  commit       %s\n' "$CI_COMMIT"
    printf '  result       FAIL\n'
    printf '  evidence     artifacts/local-ci/latest.json\n'
    printf '==========================================================================\n'
fi

exit "$EXIT_CODE"
