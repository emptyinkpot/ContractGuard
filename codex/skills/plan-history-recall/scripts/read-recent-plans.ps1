param(
    [ValidateRange(1, 50)]
    [int]$Count = 3,
    [string]$ProjectRoot = 'E:\My Project\ContractGuard\codex',
    [string]$FilePath,
    [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'

if (-not $FilePath) {
    $FilePath = Join-Path $ProjectRoot 'plugins\obsidian\data\docs\agent\plan.md'
}

if (-not $OutputRoot) {
    $OutputRoot = Join-Path $ProjectRoot '.runtime\plan-state'
}

$maintainScriptPath = Join-Path $PSScriptRoot 'maintain-plans.ps1'
$activeJsonPath = Join-Path $OutputRoot 'plan-active.json'
$rollingJsonPath = Join-Path $OutputRoot 'plan-rolling.json'

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "计划文件不存在：$FilePath"
}

if (Test-Path -LiteralPath $maintainScriptPath) {
    try {
        & $maintainScriptPath -ProjectRoot $ProjectRoot -FilePath $FilePath -OutputRoot $OutputRoot -Quiet | Out-Null
    } catch {
        Write-Warning "刷新 plan views 失败，回退到 plan.md 直接读取：$($_.Exception.Message)"
    }
}

if ((Test-Path -LiteralPath $activeJsonPath) -and (Test-Path -LiteralPath $rollingJsonPath)) {
    $activePayload = Get-Content -LiteralPath $activeJsonPath -Raw | ConvertFrom-Json
    $rollingPayload = Get-Content -LiteralPath $rollingJsonPath -Raw | ConvertFrom-Json
    $combined = @($activePayload.items) + @($rollingPayload.items)
    $selected = @($combined | Select-Object -First $Count)

    if ($selected.Count -eq 0) {
        Write-Host "未找到任何计划记录：$FilePath"
        return
    }

    $output = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $selected.Count; $i++) {
        foreach ($line in ($selected[$i].Block -split "`n")) {
            $output.Add($line)
        }

        if ($i -lt ($selected.Count - 1)) {
            $output.Add('')
        }
    }

    $output
    return
}

$lines = @(Get-Content -LiteralPath $FilePath)
$entries = New-Object System.Collections.Generic.List[object]
$currentEntry = $null

foreach ($line in $lines) {
    if ($line -match '^## ') {
        if ($null -ne $currentEntry) {
            $entries.Add($currentEntry)
        }

        $currentEntry = New-Object System.Collections.Generic.List[string]
        $currentEntry.Add($line)
        continue
    }

    if ($null -ne $currentEntry) {
        $currentEntry.Add($line)
    }
}

if ($null -ne $currentEntry) {
    $entries.Add($currentEntry)
}

if ($entries.Count -eq 0) {
    Write-Host "未找到任何计划记录：$FilePath"
    return
}

$startIndex = [Math]::Max(0, $entries.Count - $Count)
$output = New-Object System.Collections.Generic.List[string]

for ($i = $startIndex; $i -lt $entries.Count; $i++) {
    foreach ($line in $entries[$i]) {
        $output.Add($line)
    }

    if ($i -lt ($entries.Count - 1)) {
        $output.Add('')
    }
}

$output
