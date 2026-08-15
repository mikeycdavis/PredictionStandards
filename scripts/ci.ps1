#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run this repository's complete CI pipeline in an ephemeral Docker environment.

.DESCRIPTION
    The authoritative local CI command. It builds the CI image, runs `node scripts/ci.mjs` inside a
    container with the repository mounted read-only, and tears the environment down whether the
    pipeline passed or failed.

    It does not define the pipeline. The stage list lives in package.json's `ci.stages` and is
    executed by scripts/ci.mjs, which is the same code .github/workflows/ci.yml runs. This script's
    entire job is isolation and lifecycle: what runs is decided elsewhere, on purpose, so that the
    local runner and the hosted runner cannot come to disagree about what "CI passed" means.

    Exit code 0 only when every stage passed. Any other value means the pipeline did not pass, and
    scripts/submit-pr.ps1 treats it as a refusal to push.

.PARAMETER Arguments
    --keep-on-failure  leave the container and network in place when a stage fails, for debugging.
                       Teardown still happens on success, and the resources are named for this run
                       so they cannot be confused with a developer's own services.
    --verbose          stream every stage's output as it runs, rather than only a failing stage's.

.EXAMPLE
    .\scripts\ci.ps1
.EXAMPLE
    .\scripts\ci.ps1 --keep-on-failure --verbose
#>

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$KeepOnFailure = $false
$Stream = $false
foreach ($arg in $Arguments) {
    switch ($arg) {
        '--keep-on-failure' { $KeepOnFailure = $true }
        '--verbose'         { $Stream = $true }
        default {
            Write-Error "unknown option: $arg. Supported: --keep-on-failure, --verbose"
            exit 2
        }
    }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $RepoRoot
try {
    # ---- Preconditions -------------------------------------------------------------------------
    # Docker is the one piece of host state this pipeline is allowed to depend on. Everything else
    # — Node, npm, the test runner — lives in the image, which is the point.
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error 'docker was not found on PATH. Local CI requires Docker; nothing else needs to be installed.'
        exit 2
    }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'the Docker daemon is not reachable. Start Docker Desktop and re-run.'
        exit 2
    }

    $manifest = Get-Content -Raw -Path (Join-Path $RepoRoot 'package.json') | ConvertFrom-Json
    $declaredImage = $manifest.ci.image

    # The digest is written down twice — package.json reports it, Dockerfile.ci builds from it — so
    # the two are compared rather than trusted. A report naming an environment other than the one
    # that ran is worse than no report.
    $dockerfile = Get-Content -Raw -Path (Join-Path $RepoRoot 'Dockerfile.ci')
    if ($dockerfile -notmatch [regex]::Escape($declaredImage)) {
        Write-Error "package.json declares ci.image '$declaredImage' but Dockerfile.ci does not build from it. The run evidence would name an environment that did not run."
        exit 2
    }

    # ---- Identity of the thing being verified --------------------------------------------------
    $branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
    $commit = (& git rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { $branch = ''; $commit = '' }

    $env:CI_REPOSITORY = Split-Path -Leaf $RepoRoot
    $env:CI_BRANCH = $branch
    $env:CI_COMMIT = $commit
    $env:CI_IMAGE = 'predictionstandards-ci:local'

    # A project name unique to this run. Every container, network and volume compose creates is
    # namespaced under it, which is what makes teardown safe: `down` below can only reach resources
    # this run created, never a developer's own database or a sibling repository's CI.
    $runId = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $project = "predictionstandards-ci-$runId"

    $evidenceDir = Join-Path $RepoRoot 'artifacts/local-ci'
    New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
    Remove-Item -Path (Join-Path $evidenceDir 'latest.json') -ErrorAction SilentlyContinue

    $compose = @('compose', '-p', $project, '-f', 'compose.ci.yml')

    Write-Host ''
    Write-Host '=== Local CI ============================================================='
    Write-Host "  repository   $($env:CI_REPOSITORY)"
    Write-Host "  branch       $(if ($branch) { $branch } else { '(not a git checkout)' })"
    Write-Host "  commit       $(if ($commit) { $commit } else { '(unknown)' })"
    Write-Host "  environment  Docker — $declaredImage"
    Write-Host "  project      $project"
    Write-Host '=========================================================================='
    Write-Host ''

    $exitCode = 1
    try {
        Write-Host '>> building the CI image'
        & docker @compose build
        if ($LASTEXITCODE -ne 0) {
            # An image that did not build is not a pipeline that did not pass — it is a pipeline
            # that did not run. Both are nonzero here, and the distinction is in the message rather
            # than in the exit code, because nothing downstream is allowed to treat either as green.
            Write-Host 'the CI image could not be built. No stage ran.' -ForegroundColor Red
            $exitCode = 2
        }
        else {
            # `run --rm` rather than `up`: there is one service and no dependencies to wait for, so
            # the container's own exit status is the pipeline's result with nothing in between to
            # lose it. If a dependency is ever added to compose.ci.yml with a healthcheck, an
            # `up --wait` on that dependency belongs here — and a sleep never does.
            $runArgs = @('run', '--rm', '--no-deps', 'ci', 'node', 'scripts/ci.mjs')
            if ($Stream) { $runArgs += '--verbose' }

            & docker @compose @runArgs
            $exitCode = $LASTEXITCODE
        }
    }
    finally {
        # Teardown runs on success, on failure, and on Ctrl-C. `-v` removes only volumes belonging
        # to this compose project; `--remove-orphans` only reaches containers labelled with this
        # project name. Neither can touch anything outside it, and no `docker system prune` or
        # bare `docker rm` appears anywhere in this repository for that reason.
        if ($KeepOnFailure -and $exitCode -ne 0) {
            Write-Host ''
            Write-Host "kept for debugging: docker compose -p $project -f compose.ci.yml ps" -ForegroundColor Yellow
            Write-Host "tear down with:     docker compose -p $project -f compose.ci.yml down -v --remove-orphans" -ForegroundColor Yellow
        }
        else {
            & docker @compose down -v --remove-orphans *> $null
        }
    }

    Write-Host ''
    if ($exitCode -eq 0) {
        Write-Host '=== Local CI PASSED ======================================================' -ForegroundColor Green
        Write-Host "  repository   $($env:CI_REPOSITORY)"
        Write-Host "  branch       $branch"
        Write-Host "  commit       $commit"
        Write-Host '  result       PASS'
        Write-Host "  stages       $($manifest.ci.stages -join ', ')"
        Write-Host "  environment  Docker — $declaredImage"
        Write-Host "  completed    $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
        Write-Host "  evidence     artifacts/local-ci/latest.json"
        Write-Host '==========================================================================' -ForegroundColor Green
    }
    else {
        Write-Host '=== Local CI FAILED ======================================================' -ForegroundColor Red
        Write-Host "  commit       $commit"
        Write-Host '  result       FAIL'
        Write-Host "  evidence     artifacts/local-ci/latest.json"
        Write-Host '==========================================================================' -ForegroundColor Red
    }

    exit $exitCode
}
finally {
    Pop-Location
}
