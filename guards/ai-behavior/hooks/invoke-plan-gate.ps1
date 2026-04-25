[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [string[]]$Targets = @(),

    [string]$ProjectRoot = 'E:\My Project\ContractGuard',

    [switch]$BlockOnReview
)

$ErrorActionPreference = 'Stop'

function Get-RepoRootFromProjectRoot {
    param([string]$Value)

    return (Resolve-Path -LiteralPath $Value).Path
}

$guardRoot = Join-Path $ProjectRoot 'guards\ai-behavior'
$guardCli = Join-Path $guardRoot 'core\check-ai-behavior.mjs'
if (-not (Test-Path -LiteralPath $guardCli)) {
    throw "AI behavior guard CLI 不存在：$guardCli"
}

$runtimeDir = Join-Path $ProjectRoot '.runtime\ai-behavior-guard'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$repoRoot = Get-RepoRootFromProjectRoot -Value $ProjectRoot
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
$planFile = Join-Path $runtimeDir "plan-gate-$runId.txt"
$resultFile = Join-Path $runtimeDir "plan-gate-$runId.json"

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("Task summary: $Query")
if ($Targets.Count -gt 0) {
    $lines.Add('Targets:')
    foreach ($item in $Targets) {
        $lines.Add("- $item")
    }
}

Set-Content -LiteralPath $planFile -Value $lines -Encoding utf8

& node $guardCli --repo-root $repoRoot --plan-file $planFile --json-out $resultFile
$exitCode = $LASTEXITCODE

if (-not (Test-Path -LiteralPath $resultFile)) {
    throw "plan gate 未生成结果文件：$resultFile"
}

$result = Get-Content -LiteralPath $resultFile -Raw -Encoding utf8 | ConvertFrom-Json

Write-Output "AI behavior plan gate verdict: $($result.verdict) (score=$($result.score))"
if ($result.findings) {
    foreach ($finding in $result.findings) {
        Write-Output "- [$($finding.severity)] $($finding.id): $($finding.message)"
    }
}

if ($result.verdict -eq 'block') {
    throw 'AI behavior plan gate blocked this task before execution.'
}

if ($result.verdict -eq 'review' -and $BlockOnReview) {
    throw 'AI behavior plan gate requires manual review before execution.'
}

if ($exitCode -ne 0 -and $result.verdict -ne 'block') {
    throw "plan gate 执行失败，退出码：$exitCode"
}

