[CmdletBinding()]
param(
    [string]$ProjectRoot = 'E:\My Project\ContractGuard\codex',
    [string]$FilePath,
    [string]$OutputRoot,
    [ValidateRange(1, 20)]
    [int]$ActiveLimit = 5,
    [ValidateRange(1, 100)]
    [int]$RollingLimit = 20,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

if (-not $FilePath) {
    $FilePath = Join-Path $ProjectRoot 'plugins\obsidian\data\docs\agent\plan.md'
}

if (-not $OutputRoot) {
    $OutputRoot = Join-Path $ProjectRoot '.runtime\plan-state'
}

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "计划文件不存在：$FilePath"
}

if (-not (Test-Path -LiteralPath $OutputRoot)) {
    New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
}

$activeJsonPath = Join-Path $OutputRoot 'plan-active.json'
$rollingJsonPath = Join-Path $OutputRoot 'plan-rolling.json'
$indexJsonPath = Join-Path $OutputRoot 'plan-index.json'
$activeMdPath = Join-Path $OutputRoot 'plan-active.md'
$rollingMdPath = Join-Path $OutputRoot 'plan-rolling.md'

$terminalStatuses = @('已完成', '已验证', '失败', '已放弃', '已替换')

function Get-FieldValue {
    param(
        [string]$Text,
        [string]$Label
    )

    $escaped = [Regex]::Escape($Label)
    $match = [Regex]::Match($Text, "(?m)^- $escaped：(.+)$")
    if ($match.Success) {
        return $match.Groups[1].Value.Trim()
    }

    return ''
}

function Get-BulletBlock {
    param(
        [string]$Text,
        [string]$Label
    )

    $escaped = [Regex]::Escape($Label)
    $match = [Regex]::Match($Text, "(?ms)^- $escaped：\r?\n(?<items>(?:^\s{2,}(?:-|\d+\.)\s+[^\r\n]*\r?\n?)*)")
    if (-not $match.Success) {
        return @()
    }

    $items = New-Object System.Collections.Generic.List[string]
    $lines = $match.Groups['items'].Value -split "`r?`n"
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if (-not $trimmed) {
            continue
        }

        $item = ($trimmed -replace '^(-|\d+\.)\s+', '').Trim()
        if ($item -and $item -ne '无') {
            [void]$items.Add($item)
        }
    }

    return @($items)
}

function Get-LatestStatusUpdate {
    param([string]$Block)

    $sections = $Block -split "(?m)^### 状态更新\s*$"
    if ($sections.Count -le 1) {
        return [pscustomobject]@{
            UpdatedAt = ''
            Status = ''
            Notes = @()
        }
    }

    $latest = $sections[$sections.Count - 1]
    return [pscustomobject]@{
        UpdatedAt = Get-FieldValue -Text $latest -Label '更新时间'
        Status = Get-FieldValue -Text $latest -Label '状态'
        Notes = @(Get-BulletBlock -Text $latest -Label '补充说明')
    }
}

function Convert-ToSortableDate {
    param(
        [string]$Value,
        [datetime]$Fallback
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $Fallback
    }

    try {
        return [datetimeoffset]::Parse($Value).DateTime
    } catch {
        return $Fallback
    }
}

function Get-PlanEntries {
    param([string]$PlanPath)

    $lines = @(Get-Content -LiteralPath $PlanPath)
    $blocks = New-Object System.Collections.Generic.List[string]
    $current = $null

    foreach ($line in $lines) {
        if ($line -match '^## ') {
            if ($null -ne $current) {
                $blocks.Add(($current -join "`n"))
            }

            $current = New-Object System.Collections.Generic.List[string]
            $current.Add($line)
            continue
        }

        if ($null -ne $current) {
            $current.Add($line)
        }
    }

    if ($null -ne $current) {
        $blocks.Add(($current -join "`n"))
    }

    $results = New-Object System.Collections.Generic.List[object]

    for ($i = 0; $i -lt $blocks.Count; $i++) {
        $block = $blocks[$i]
        $heading = ($block -split "`n", 2)[0]
        $headingText = ($heading -replace '^##\s+', '').Trim()
        $createdAtText = ''
        $title = $headingText

        if ($headingText -match '^(?<ts>\d{4}-\d{2}-\d{2}.*?\+\d{2}:\d{2})\s+-\s+(?<title>.+)$') {
            $createdAtText = $matches['ts']
            $title = $matches['title']
        }

        $latestStatus = Get-LatestStatusUpdate -Block $block
        $status = if ($latestStatus.Status) { $latestStatus.Status } else { Get-FieldValue -Text $block -Label '状态' }
        if (-not $status) {
            $status = '计划中'
        }

        $createdAt = Convert-ToSortableDate -Value $createdAtText -Fallback ([datetime]'2000-01-01')
        $updatedAt = Convert-ToSortableDate -Value $latestStatus.UpdatedAt -Fallback $createdAt
        $effectiveAt = $updatedAt

        $planId = Get-FieldValue -Text $block -Label '计划ID'
        if (-not $planId) {
            $planId = 'UNTRACKED-{0:d4}' -f $i
        }

        $results.Add([pscustomobject]@{
            PlanId = $planId
            Title = $title.Trim()
            Task = Get-FieldValue -Text $block -Label '任务'
            Status = $status
            CreatedAt = $createdAt.ToString('o')
            UpdatedAt = $updatedAt.ToString('o')
            EffectiveAt = $effectiveAt.ToString('o')
            EffectiveTicks = $effectiveAt.Ticks
            Targets = @(Get-BulletBlock -Text $block -Label '目标')
            ReferencePlans = @(Get-BulletBlock -Text $block -Label '参考计划')
            LatestNotes = @($latestStatus.Notes)
            IsTerminal = $terminalStatuses -contains $status
            Block = $block
            SourcePath = $PlanPath
        })
    }

    return $results.ToArray()
}

function Write-Utf8Json {
    param(
        [string]$Path,
        [object]$Value,
        [int]$Depth = 8
    )

    $json = $Value | ConvertTo-Json -Depth $Depth
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $encoding)
}

function Write-Utf8Text {
    param(
        [string]$Path,
        [string]$Text
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function New-MarkdownView {
    param(
        [string]$Title,
        [object[]]$Entries,
        [switch]$FullBlock
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# $Title")
    $lines.Add('')

    if ($Entries.Count -eq 0) {
        $lines.Add('- 无')
        $lines.Add('')
        return ($lines -join [Environment]::NewLine)
    }

    foreach ($entry in $Entries) {
        if ($FullBlock) {
            foreach ($line in ($entry.Block -split "`n")) {
                $lines.Add($line)
            }
        } else {
            $lines.Add("## $($entry.Title)")
            $lines.Add('')
            $lines.Add("- 计划ID：$($entry.PlanId)")
            $lines.Add("- 状态：$($entry.Status)")
            $lines.Add("- 最近活跃：$($entry.UpdatedAt)")
            $lines.Add("- 任务：$($entry.Task)")
            if ($entry.ReferencePlans.Count -gt 0) {
                $lines.Add("- 参考计划：")
                foreach ($ref in $entry.ReferencePlans) {
                    $lines.Add("  - $ref")
                }
            }
        }

        $lines.Add('')
    }

    return ($lines -join [Environment]::NewLine)
}

$entries = @(Get-PlanEntries -PlanPath $FilePath)
$sorted = @(
    $entries |
        Sort-Object @{ Expression = { $_.EffectiveTicks }; Descending = $true }, @{ Expression = { $_.PlanId }; Descending = $true }
)

$activeEntries = @(
    $sorted |
        Where-Object { -not $_.IsTerminal } |
        Select-Object -First $ActiveLimit
)

$activeIds = @{}
foreach ($entry in $activeEntries) {
    $activeIds[$entry.PlanId] = $true
}

$rollingEntries = @(
    $sorted |
        Where-Object { -not $activeIds.ContainsKey($_.PlanId) } |
        Select-Object -First $RollingLimit
)

$rollingIds = @{}
foreach ($entry in $rollingEntries) {
    $rollingIds[$entry.PlanId] = $true
}

$indexItems = foreach ($entry in $sorted) {
    $layer = 'archive'
    if ($activeIds.ContainsKey($entry.PlanId)) {
        $layer = 'active'
    } elseif ($rollingIds.ContainsKey($entry.PlanId)) {
        $layer = 'rolling'
    }

    [pscustomobject]@{
        planId = $entry.PlanId
        title = $entry.Title
        status = $entry.Status
        layer = $layer
        effectiveAt = $entry.EffectiveAt
        task = $entry.Task
    }
}

$generatedAt = (Get-Date).ToString('o')

$activePayload = [pscustomobject]@{
    generatedAt = $generatedAt
    sourcePlanPath = $FilePath
    count = @($activeEntries).Count
    items = @($activeEntries)
}

$rollingPayload = [pscustomobject]@{
    generatedAt = $generatedAt
    sourcePlanPath = $FilePath
    count = @($rollingEntries).Count
    items = @($rollingEntries)
}

$indexPayload = [pscustomobject]@{
    generatedAt = $generatedAt
    sourcePlanPath = $FilePath
    activeLimit = $ActiveLimit
    rollingLimit = $RollingLimit
    items = @($indexItems)
}

Write-Utf8Json -Path $activeJsonPath -Value $activePayload
Write-Utf8Json -Path $rollingJsonPath -Value $rollingPayload
Write-Utf8Json -Path $indexJsonPath -Value $indexPayload
Write-Utf8Text -Path $activeMdPath -Text (New-MarkdownView -Title 'Active Plans' -Entries $activeEntries -FullBlock)
Write-Utf8Text -Path $rollingMdPath -Text (New-MarkdownView -Title 'Rolling Plans' -Entries $rollingEntries)

if (-not $Quiet) {
    Write-Host "已刷新 plan views：$OutputRoot"
    Write-Host "active=$(@($activeEntries).Count) rolling=$(@($rollingEntries).Count) total=$(@($entries).Count)"
}
