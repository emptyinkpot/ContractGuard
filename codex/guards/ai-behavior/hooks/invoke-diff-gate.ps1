[CmdletBinding()]
param(
    [string]$RepoPath = '.',

    [string[]]$Paths = @(),
    [string]$ProjectRoot = 'E:\My Project\ContractGuard\codex',
    [switch]$UseWorkingTree,
    [switch]$BlockOnReview
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $ProjectRoot
$realScript = Join-Path $repoRoot 'guards\ai-behavior\hooks\invoke-diff-gate.ps1'
if (-not (Test-Path -LiteralPath $realScript)) {
    throw "ContractGuard diff gate wrapper target missing: $realScript"
}

$params = @{
    RepoPath = $RepoPath
    Paths = $Paths
    ProjectRoot = $repoRoot
}
if ($UseWorkingTree) { $params.UseWorkingTree = $true }
if ($BlockOnReview) { $params.BlockOnReview = $true }
& $realScript @params
exit $LASTEXITCODE
