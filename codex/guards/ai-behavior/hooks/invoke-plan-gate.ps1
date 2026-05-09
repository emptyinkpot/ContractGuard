[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [string[]]$Targets = @(),

    [string]$ProjectRoot = 'E:\My Project\ContractGuard\codex',

    [switch]$BlockOnReview
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $ProjectRoot
$realScript = Join-Path $repoRoot 'guards\ai-behavior\hooks\invoke-plan-gate.ps1'
if (-not (Test-Path -LiteralPath $realScript)) {
    throw "ContractGuard plan gate wrapper target missing: $realScript"
}

& $realScript -Query $Query -Targets $Targets -ProjectRoot $repoRoot -BlockOnReview:$BlockOnReview
exit $LASTEXITCODE
