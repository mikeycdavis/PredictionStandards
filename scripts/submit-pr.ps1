#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify the current commit with local Docker CI, then push exactly that commit and open a PR.

.DESCRIPTION
    A thin wrapper. The logic lives in scripts/submit-pr.mjs, and deliberately so: the guard this
    workflow rests on — that the commit pushed is exactly the commit CI verified — is worth more as
    tested code than as a shell transcript, and test/local-ci.test.mjs pins it inside the pipeline
    this command runs. A PowerShell reimplementation would be a second copy of that guard, untested,
    free to drift from the one with the tests.

    The sequence: reject a dirty tree -> record HEAD -> run scripts/ci.ps1 -> re-check HEAD ->
    push the SHA (not the branch) -> `gh pr create`. It never commits anything to make CI pass and
    never pushes when verification failed.

    `gh` uses your existing authenticated session. No token is read, stored, or written by this
    repository.

.PARAMETER Arguments
    --base <branch>   the branch to merge into (default: main)
    --title <text>    PR title (default: taken from the commits, via `gh pr create --fill`)
    --body <text>     PR body; the verification block is appended, never substituted for it
    --draft           open the PR as a draft
    --dry-run         verify and report, but push nothing and create nothing
    --verbose         stream every CI stage's output

.EXAMPLE
    .\scripts\submit-pr.ps1
.EXAMPLE
    .\scripts\submit-pr.ps1 --draft --base develop
#>

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$RepoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'node was not found on PATH. The submission harness runs on the host; only the CI pipeline itself is containerised.'
    exit 2
}

& node (Join-Path $RepoRoot 'scripts/submit-pr.mjs') @Arguments
exit $LASTEXITCODE
