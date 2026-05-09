[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [string[]]$Targets = @(),

    [ValidateRange(1, 20)]
    [int]$RecentCount = 3,

    [ValidateRange(1, 20)]
    [int]$RelevantCount = 5,

    [bool]$UseQmdFallback = $true,

    [ValidateRange(0, 200)]
    [int]$WeakHitScoreThreshold = 36,

    [ValidateRange(0, 20)]
    [int]$WeakHitMinMatches = 2,

    [ValidateRange(1, 10)]
    [int]$QmdCount = 3,

    [string[]]$ExcludePlanIds = @(),

    [string]$ProjectRoot = 'E:\\My Project\\Atramenti-Console\\codex',
    [string]$FilePath
)

$ErrorActionPreference = 'Stop'

if (-not $FilePath) {
    $FilePath = Join-Path $ProjectRoot 'plugins\\obsidian\\data\\docs\\agent\\plan.md'
}

$recentScriptPath = Join-Path $PSScriptRoot 'read-recent-plans.ps1'
$relevantScriptPath = Join-Path $PSScriptRoot 'read-relevant-plans.ps1'
$planGateScriptPath = Join-Path $ProjectRoot 'guards\\ai-behavior\\hooks\\invoke-plan-gate.ps1'

foreach ($requiredPath in @($recentScriptPath, $relevantScriptPath, $planGateScriptPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "预检脚本不存在：$requiredPath"
    }
}

Write-Output "计划预检：$Query"
if ($Targets.Count -gt 0) {
    Write-Output "目标线索：$($Targets -join ' | ')"
}
Write-Output "策略：最近计划 $RecentCount 条 + 相关计划 $RelevantCount 条$(if ($UseQmdFallback) { '（lexical 弱命中时补 QMD）' } else { '' })"
Write-Output ''

Write-Output '## AI behavior plan gate'
& $planGateScriptPath -Query $Query -Targets $Targets -ProjectRoot $ProjectRoot
Write-Output ''

Write-Output '## 最近计划'
& $recentScriptPath -Count $RecentCount -ProjectRoot $ProjectRoot -FilePath $FilePath
Write-Output ''

Write-Output '## 相关计划'
$relevantParams = @{
    Query                 = $Query
    Targets               = $Targets
    Count                 = $RelevantCount
    ExcludeRecentCount    = $RecentCount
    ExcludePlanIds        = $ExcludePlanIds
    WeakHitScoreThreshold = $WeakHitScoreThreshold
    WeakHitMinMatches     = $WeakHitMinMatches
    QmdCount              = $QmdCount
    ProjectRoot           = $ProjectRoot
    FilePath              = $FilePath
}
if ($UseQmdFallback) {
    $relevantParams.UseQmdFallback = $true
}

& $relevantScriptPath @relevantParams
