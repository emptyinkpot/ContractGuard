[CmdletBinding()]
param(
    [string]$RepoPath = '.',

    [string[]]$Paths = @(),

    [string]$ProjectRoot = 'E:\My Project\ContractGuard',

    [switch]$BlockOnReview
)

$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
    param([string]$ProbePath)

    $resolved = if (Test-Path -LiteralPath $ProbePath) {
        (Resolve-Path -LiteralPath $ProbePath).Path
    } else {
        [System.IO.Path]::GetFullPath($ProbePath)
    }

    $output = & git -C $resolved rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "未解析到 Git repo：$resolved"
    }

    return ($output | Select-Object -First 1).Trim()
}

function Normalize-GitPath {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $Value
    }

    return $Value.Replace('\', '/')
}

$guardRoot = Join-Path $ProjectRoot 'guards\ai-behavior'
$guardCli = Join-Path $guardRoot 'core\check-ai-behavior.mjs'
if (-not (Test-Path -LiteralPath $guardCli)) {
    throw "AI behavior guard CLI 不存在：$guardCli"
}

$runtimeDir = Join-Path $ProjectRoot '.runtime\ai-behavior-guard'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$repoRoot = Get-RepoRoot -ProbePath $RepoPath
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
$diffFile = Join-Path $runtimeDir "diff-gate-$runId.diff"
$changedFilesFile = Join-Path $runtimeDir "diff-gate-$runId-files.txt"
$resultFile = Join-Path $runtimeDir "diff-gate-$runId.json"

$relativePaths = @()
foreach ($item in $Paths) {
    if ([string]::IsNullOrWhiteSpace($item)) {
        continue
    }

    $resolved = if (Test-Path -LiteralPath $item) {
        (Resolve-Path -LiteralPath $item).Path
    } elseif ([System.IO.Path]::IsPathRooted($item)) {
        $item
    } else {
        Join-Path $repoRoot $item
    }

    $relativePaths += Normalize-GitPath -Value ([System.IO.Path]::GetRelativePath($repoRoot, $resolved))
}
$relativePaths = @($relativePaths | Select-Object -Unique)

$nameOnlyArgs = @('diff', '--cached', '--name-only', '--diff-filter=ACMR')
if ($relativePaths.Count -gt 0) {
    $nameOnlyArgs += '--'
    $nameOnlyArgs += $relativePaths
}
$changedFiles = @(& git -C $repoRoot @nameOnlyArgs)
if ($LASTEXITCODE -ne 0) {
    throw '读取 staged changed files 失败。'
}
$changedFiles = @($changedFiles | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($changedFiles.Count -eq 0) {
    throw '当前暂存区没有可供 diff gate 审核的改动。'
}

$diffArgs = @('diff', '--cached', '--no-color')
if ($relativePaths.Count -gt 0) {
    $diffArgs += '--'
    $diffArgs += $relativePaths
}
$diffText = & git -C $repoRoot @diffArgs
if ($LASTEXITCODE -ne 0) {
    throw '读取 staged diff 失败。'
}

Set-Content -LiteralPath $changedFilesFile -Value $changedFiles -Encoding utf8
Set-Content -LiteralPath $diffFile -Value $diffText -Encoding utf8

& node $guardCli --repo-root $repoRoot --diff-file $diffFile --changed-files-file $changedFilesFile --json-out $resultFile
$exitCode = $LASTEXITCODE

if (-not (Test-Path -LiteralPath $resultFile)) {
    throw "diff gate 未生成结果文件：$resultFile"
}

$result = Get-Content -LiteralPath $resultFile -Raw -Encoding utf8 | ConvertFrom-Json

Write-Output "AI behavior diff gate verdict: $($result.verdict) (score=$($result.score))"
Write-Output "Staged files:"
foreach ($item in $changedFiles) {
    Write-Output "- $item"
}
if ($result.findings) {
    foreach ($finding in $result.findings) {
        Write-Output "- [$($finding.severity)] $($finding.id): $($finding.message)"
    }
}

if ($result.verdict -eq 'block') {
    throw 'AI behavior diff gate blocked this staged change set.'
}

if ($result.verdict -eq 'review' -and $BlockOnReview) {
    throw 'AI behavior diff gate requires manual review before closeout.'
}

if ($exitCode -ne 0 -and $result.verdict -ne 'block') {
    throw "diff gate 执行失败，退出码：$exitCode"
}

