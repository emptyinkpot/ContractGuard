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

$scopeGateCli = 'E:\My Project\ContractGuard\unified-gates\gates\scope-control-gate.mjs'
if (-not (Test-Path -LiteralPath $scopeGateCli)) {
    throw "scope gate CLI 不存在：$scopeGateCli"
}

$runtimeDir = Join-Path $ProjectRoot '.runtime\ai-behavior-guard'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$repoRoot = Get-RepoRootFromProjectRoot -Value $ProjectRoot
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
$planFile = Join-Path $runtimeDir "plan-gate-$runId.txt"
$resultFile = Join-Path $runtimeDir "plan-gate-$runId.json"
$taskPlanFile = Join-Path $runtimeDir "task-plan-$runId.json"

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("Task summary: $Query")
if ($Targets.Count -gt 0) {
    $lines.Add('Targets:')
    foreach ($item in $Targets) {
        $lines.Add("- $item")
    }
}

Set-Content -LiteralPath $planFile -Value $lines -Encoding utf8

function ConvertTo-GitPath {
    param([string]$Value)

    return $Value -replace '\\', '/'
}

function Get-StagedFiles {
    $output = & git diff --cached --name-only
    if ($LASTEXITCODE -ne 0) {
        throw 'git diff --cached --name-only failed.'
    }

    if (-not $output) {
        return @()
    }

    return @($output | ForEach-Object { ConvertTo-GitPath $_ } | Where-Object { $_ })
}

function Get-StagedDiff {
    $output = & git diff --cached --unified=0
    if ($LASTEXITCODE -ne 0) {
        throw 'git diff --cached --unified=0 failed.'
    }

    return ($output -join "`n")
}

function ConvertFrom-UnifiedDiffToExactPlan {
    param([string]$DiffText)

    $fileDiffs = @{}
    $currentFile = $null
    $currentHunk = $null

    foreach ($rawLine in ($DiffText -split "`r?`n")) {
        if ($rawLine.StartsWith('+++ b/')) {
            $currentFile = $rawLine.Substring(6).Trim()
            if (-not $fileDiffs.ContainsKey($currentFile)) {
                $fileDiffs[$currentFile] = New-Object 'System.Collections.Generic.List[object]'
            }
            $currentHunk = $null
            continue
        }

        if ($rawLine.StartsWith('@@')) {
            $currentHunk = $rawLine.Trim()
            continue
        }

        if (-not $currentFile) {
            continue
        }

        if ($rawLine.StartsWith('+') -and -not $rawLine.StartsWith('+++')) {
            $fileDiffs[$currentFile].Add([pscustomobject]@{
                op = 'add'
                hunk = $currentHunk
                text = $rawLine.Substring(1)
            })
            continue
        }

        if ($rawLine.StartsWith('-') -and -not $rawLine.StartsWith('---')) {
            $fileDiffs[$currentFile].Add([pscustomobject]@{
                op = 'remove'
                hunk = $currentHunk
                text = $rawLine.Substring(1)
            })
        }
    }

    return @{
        diff = @{
            fileDiffs = $fileDiffs
        }
    }
}

$stagedFiles = Get-StagedFiles
$stagedDiffText = Get-StagedDiff
$taskPlan = @{
    objective = $Query
    approved = $false
    allowedFiles = @($stagedFiles)
    allowedChangeTypes = @("patch")
    exactDiffMatch = $true
    exactDiffFilePath = $taskPlanFile -replace '\.json$', '.exact.json'
    forbiddenPatterns = @(
        "fetch(",
        "axios.",
        "api.",
        "interface ",
        "type ",
        "function ",
        "const ",
        "let ",
        "var "
    )
    maxDiffLines = 50
    allowDelete = $false
    allowNewFiles = $false
    allowFunctionDelete = $false
    allowApiChange = $false
    allowTypeChange = $false
} | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $taskPlanFile -Value $taskPlan -Encoding utf8
$exactDiffPlan = ConvertFrom-UnifiedDiffToExactPlan -DiffText $stagedDiffText
Set-Content -LiteralPath ($taskPlanFile -replace '\.json$', '.exact.json') -Value ($exactDiffPlan | ConvertTo-Json -Depth 10) -Encoding utf8

$taskStateGateCli = 'E:\My Project\ContractGuard\unified-gates\gates\task-state-gate.mjs'
if (-not (Test-Path -LiteralPath $taskStateGateCli)) {
    throw "task state gate CLI 不存在：$taskStateGateCli"
}

$taskScope = @{
    allowedFiles = @($stagedFiles)
    maxDiffLines = 50
    allowDelete = $false
    allowApiChange = $false
    allowTypeChange = $false
    allowFunctionDelete = $false
    allowMultipleFiles = $false
    primaryObjective = $Query
    allowExpansion = $false
    noParallelThinking = $true
} | ConvertTo-Json -Compress

$env:TASK_PLAN_PATH = $taskPlanFile
$env:TASK_STATE = 'PLAN'
$env:TASK_OBJECTIVE = $Query
$env:TASK_PLAN = $taskPlan
$env:TASK_ALLOW_EXECUTION = 'false'
$env:TASK_ALLOW_EXPANSION = 'false'
$env:TASK_SCOPE = $taskScope
$env:CHANGED_FILES = (@($stagedFiles) | ConvertTo-Json -Compress)
$env:DIFF = $stagedDiffText

& node $taskStateGateCli
$taskStateExitCode = $LASTEXITCODE
if ($taskStateExitCode -ne 0) {
    throw "task state gate blocked this task before execution."
}

& node $scopeGateCli
$scopeExitCode = $LASTEXITCODE
if ($scopeExitCode -ne 0) {
    throw "scope gate blocked this task before execution."
}

$planDiffGateCli = 'E:\My Project\ContractGuard\unified-gates\gates\plan-diff-gate.mjs'
if (-not (Test-Path -LiteralPath $planDiffGateCli)) {
    throw "plan diff gate CLI 不存在：$planDiffGateCli"
}

& node $planDiffGateCli
$planDiffExitCode = $LASTEXITCODE
if ($planDiffExitCode -ne 0) {
    throw "plan diff gate blocked this task before execution."
}

$env:TASK_STATE = 'EXECUTE'
$taskPlanWithApproval = @{
    objective = $Query
    approved = $true
    allowedFiles = @($stagedFiles)
    allowedChangeTypes = @("patch")
    exactDiffMatch = $true
    exactDiffFilePath = $taskPlanFile -replace '\.json$', '.exact.json'
    forbiddenPatterns = @(
        "fetch(",
        "axios.",
        "api.",
        "interface ",
        "type ",
        "function ",
        "const ",
        "let ",
        "var "
    )
    maxDiffLines = 50
    allowDelete = $false
    allowNewFiles = $false
    allowFunctionDelete = $false
    allowApiChange = $false
    allowTypeChange = $false
} | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $taskPlanFile -Value $taskPlanWithApproval -Encoding utf8
$env:TASK_PLAN = $taskPlanWithApproval

& node $taskStateGateCli
$taskStateExecuteExitCode = $LASTEXITCODE
if ($taskStateExecuteExitCode -ne 0) {
    throw "task state gate blocked execution state transition."
}

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

