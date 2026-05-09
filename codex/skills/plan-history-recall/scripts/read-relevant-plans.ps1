[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [string[]]$Targets = @(),

    [ValidateRange(1, 20)]
    [int]$Count = 5,

    [ValidateRange(0, 20)]
    [int]$ExcludeRecentCount = 0,

    [string[]]$ExcludePlanIds = @(),

    [switch]$UseQmdFallback,

    [ValidateRange(0, 200)]
    [int]$WeakHitScoreThreshold = 36,

    [ValidateRange(0, 20)]
    [int]$WeakHitMinMatches = 2,

    [ValidateRange(1, 10)]
    [int]$QmdCount = 3,

    [string]$QmdCollection = 'experience-manager',

    [switch]$AsJson,

    [string]$ProjectRoot = 'E:\\My Project\\Atramenti-Console\\codex',
    [string]$FilePath
)

$ErrorActionPreference = 'Stop'

if (-not $FilePath) {
    $FilePath = Join-Path $ProjectRoot 'plugins\\obsidian\\data\\docs\\agent\\plan.md'
}

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "计划文件不存在：$FilePath"
}

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
            $items.Add($item)
        }
    }

    return @($items)
}

function Get-LatestStatusUpdate {
    param(
        [string]$Block
    )

    $sections = $Block -split "(?m)^### 状态更新\s*$"
    if ($sections.Count -le 1) {
        return [pscustomobject]@{
            UpdatedAt = ''
            Status    = ''
            Notes     = @()
        }
    }

    $latest = $sections[$sections.Count - 1]
    return [pscustomobject]@{
        UpdatedAt = Get-FieldValue -Text $latest -Label '更新时间'
        Status    = Get-FieldValue -Text $latest -Label '状态'
        Notes     = @(Get-BulletBlock -Text $latest -Label '补充说明')
    }
}

function Get-PlanEntries {
    param(
        [string]$PlanPath
    )

    $lines = @(Get-Content -LiteralPath $PlanPath)
    $entries = New-Object System.Collections.Generic.List[object]
    $current = $null

    foreach ($line in $lines) {
        if ($line -match '^## ') {
            if ($null -ne $current) {
                $entries.Add(($current -join "`n"))
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
        $entries.Add(($current -join "`n"))
    }

    $result = New-Object System.Collections.Generic.List[object]
    foreach ($block in $entries) {
        $heading = ($block -split "`n", 2)[0]
        $title = ($heading -replace '^##\s+', '') -replace '^\d{4}-\d{2}-\d{2}.*?\s-\s', ''
        $latestStatus = Get-LatestStatusUpdate -Block $block
        $status = if ($latestStatus.Status) { $latestStatus.Status } else { Get-FieldValue -Text $block -Label '状态' }

        $result.Add([pscustomobject]@{
                Title             = $title.Trim()
                PlanId            = Get-FieldValue -Text $block -Label '计划ID'
                Task              = Get-FieldValue -Text $block -Label '任务'
                Targets           = @(Get-BulletBlock -Text $block -Label '目标')
                Assumptions       = @(Get-BulletBlock -Text $block -Label '假设')
                ReferencePlans    = @(Get-BulletBlock -Text $block -Label '参考计划')
                AvoidRepeating    = @(Get-BulletBlock -Text $block -Label '避免重走')
                Steps             = @(Get-BulletBlock -Text $block -Label '计划')
                Verification      = @(Get-BulletBlock -Text $block -Label '验证标准')
                Status            = $status
                UpdatedAt         = $latestStatus.UpdatedAt
                LatestNotes       = @($latestStatus.Notes)
                Block             = $block
            })
    }

    return $result.ToArray()
}

function Get-KeywordTokens {
    param(
        [string[]]$Values
    )

    $tokens = New-Object System.Collections.Generic.List[string]

    foreach ($value in $Values) {
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }

        $trimmed = $value.Trim()
        if ($trimmed.Length -ge 2) {
            $candidate = $trimmed.ToLowerInvariant()
            if (-not ($tokens -contains $candidate)) {
                [void]$tokens.Add($candidate)
            }
        }

        $leaf = Split-Path -Leaf $trimmed
        if ($leaf -and $leaf.Length -ge 2) {
            $leafToken = $leaf.ToLowerInvariant()
            if (-not ($tokens -contains $leafToken)) {
                [void]$tokens.Add($leafToken)
            }
        }

        foreach ($match in [Regex]::Matches($trimmed, '[\p{IsCJKUnifiedIdeographs}]{2,}|[A-Za-z0-9][A-Za-z0-9._/-]{1,}')) {
            $token = $match.Value.Trim().ToLowerInvariant()
            if ($token.Length -ge 2 -and -not ($tokens -contains $token)) {
                [void]$tokens.Add($token)
            }
        }
    }

    return $tokens.ToArray()
}

function Add-CjkFragments {
    param(
        [System.Collections.Generic.List[string]]$TokenList,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }

    foreach ($match in [Regex]::Matches($Value, '[\p{IsCJKUnifiedIdeographs}]{4,}')) {
        $segment = $match.Value.Trim().ToLowerInvariant()
        for ($size = 4; $size -ge 2; $size--) {
            if ($segment.Length -lt $size) {
                continue
            }

            for ($start = 0; $start -le ($segment.Length - $size); $start++) {
                $fragment = $segment.Substring($start, $size)
                if (-not ($TokenList -contains $fragment)) {
                    [void]$TokenList.Add($fragment)
                }
            }
        }
    }
}

function Get-ScoreBreakdown {
    param(
        [pscustomobject]$Entry,
        [string]$QueryText,
        [string[]]$SearchTerms
    )

    $score = 0
    $matched = New-Object System.Collections.Generic.List[string]
    $titleText = $Entry.Title.ToLowerInvariant()
    $taskText = $Entry.Task.ToLowerInvariant()
    $targetText = ($Entry.Targets -join ' ').ToLowerInvariant()
    $statusText = ($Entry.LatestNotes -join ' ').ToLowerInvariant()
    $fullText = $Entry.Block.ToLowerInvariant()

    if ($QueryText -and $fullText.Contains($QueryText)) {
        $score += 100
        if (-not ($matched -contains $QueryText)) {
            [void]$matched.Add($QueryText)
        }
    }

    foreach ($term in $SearchTerms) {
        if (-not $term) {
            continue
        }

        if ($titleText.Contains($term)) {
            $score += 30
            if (-not ($matched -contains $term)) {
                [void]$matched.Add($term)
            }
            continue
        }

        if ($taskText.Contains($term)) {
            $score += 22
            if (-not ($matched -contains $term)) {
                [void]$matched.Add($term)
            }
            continue
        }

        if ($targetText.Contains($term)) {
            $score += 18
            if (-not ($matched -contains $term)) {
                [void]$matched.Add($term)
            }
            continue
        }

        if ($statusText.Contains($term)) {
            $score += 12
            if (-not ($matched -contains $term)) {
                [void]$matched.Add($term)
            }
            continue
        }

        if ($fullText.Contains($term)) {
            $score += 6
            if (-not ($matched -contains $term)) {
                [void]$matched.Add($term)
            }
        }
    }

    return [pscustomobject]@{
        Score        = $score
        MatchedTerms = $matched.ToArray()
    }
}

function Get-WeakHitReason {
    param(
        [object[]]$Results,
        [int]$ScoreThreshold,
        [int]$MinMatches
    )

    if ($Results.Count -eq 0) {
        return 'lexical 未命中任何相关计划'
    }

    $top = $Results[0]
    if ($top.Score -lt $ScoreThreshold) {
        return "lexical 最高分 $($top.Score) 低于阈值 $ScoreThreshold"
    }

    if (@($top.MatchedTerms).Count -lt $MinMatches) {
        return "lexical 最高命中词数 $(@($top.MatchedTerms).Count) 低于阈值 $MinMatches"
    }

    return $null
}

function Get-FirstJsonArray {
    param(
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    $start = $Text.IndexOf('[')
    if ($start -lt 0) {
        return $null
    }

    $depth = 0
    $inString = $false
    $escape = $false

    for ($i = $start; $i -lt $Text.Length; $i++) {
        $char = $Text[$i]

        if ($inString) {
            if ($escape) {
                $escape = $false
                continue
            }

            if ($char -eq '\') {
                $escape = $true
                continue
            }

            if ($char -eq '"') {
                $inString = $false
            }
            continue
        }

        if ($char -eq '"') {
            $inString = $true
            continue
        }

        if ($char -eq '[') {
            $depth += 1
            continue
        }

        if ($char -eq ']') {
            $depth -= 1
            if ($depth -eq 0) {
                return $Text.Substring($start, ($i - $start + 1))
            }
        }
    }

    return $null
}

function Get-PlanIdFromText {
    param(
        [string[]]$Values
    )

    foreach ($value in $Values) {
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }

        $match = [Regex]::Match($value, 'PLAN-[A-Za-z0-9-]+')
        if ($match.Success) {
            return $match.Value
        }
    }

    return ''
}

function Invoke-QmdFallback {
    param(
        [string]$SearchQuery,
        [string[]]$Targets,
        [int]$Limit,
        [string]$Collection,
        [string]$RootPath
    )

    $qmdScriptPath = Join-Path $RootPath 'skills\\qmd\\scripts\\qmd.ps1'
    if (-not (Test-Path -LiteralPath $qmdScriptPath)) {
        return [pscustomobject]@{
            Query   = $SearchQuery
            Results = @()
            Error   = "QMD wrapper 不存在：$qmdScriptPath"
        }
    }

    $queryParts = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($SearchQuery)) {
        [void]$queryParts.Add($SearchQuery.Trim())
    }

    foreach ($target in $Targets) {
        $leaf = Split-Path -Leaf $target
        if ([string]::IsNullOrWhiteSpace($leaf)) {
            continue
        }

        if (-not ($queryParts -contains $leaf)) {
            [void]$queryParts.Add($leaf)
        }
    }

    if ($queryParts.Count -eq 0) {
        [void]$queryParts.Add($SearchQuery.Trim())
    }

    $qmdQuery = ($queryParts -join ' ').Trim()
    if ($qmdQuery.Length -gt 180) {
        $qmdQuery = $qmdQuery.Substring(0, 180).Trim()
    }

    try {
        $rawOutput = & $qmdScriptPath query -c $Collection $qmdQuery -n $Limit --json 2>&1
        $outputText = (($rawOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
        if ($LASTEXITCODE -ne 0) {
            return [pscustomobject]@{
                Query   = $qmdQuery
                Results = @()
                Error   = $outputText
            }
        }

        $jsonText = Get-FirstJsonArray -Text $outputText
        if (-not $jsonText) {
            return [pscustomobject]@{
                Query   = $qmdQuery
                Results = @()
                Error   = 'QMD 输出中未解析到 JSON 数组'
            }
        }

        return [pscustomobject]@{
            Query   = $qmdQuery
            Results = @((ConvertFrom-Json -InputObject $jsonText))
            Error   = ''
        }
    } catch {
        return [pscustomobject]@{
            Query   = $qmdQuery
            Results = @()
            Error   = $_.Exception.Message
        }
    }
}

$queryText = $Query.Trim().ToLowerInvariant()
$searchTerms = New-Object System.Collections.Generic.List[string]
foreach ($token in (Get-KeywordTokens -Values @($Query) + $Targets)) {
    if (-not ($searchTerms -contains $token)) {
        [void]$searchTerms.Add($token)
    }
}

Add-CjkFragments -TokenList $searchTerms -Value $Query
foreach ($target in $Targets) {
    Add-CjkFragments -TokenList $searchTerms -Value $target
}
$searchTerms = $searchTerms.ToArray()
$entries = @(Get-PlanEntries -PlanPath $FilePath)
$entryLookup = @{}
foreach ($entry in $entries) {
    if ($entry.PlanId -and -not $entryLookup.ContainsKey($entry.PlanId)) {
        $entryLookup[$entry.PlanId] = $entry
    }
}

$excludedRecentPlanIds = @()
if ($ExcludeRecentCount -gt 0 -and $entries.Count -gt $ExcludeRecentCount) {
    $excludedRecentPlanIds = @(
        $entries[($entries.Count - $ExcludeRecentCount)..($entries.Count - 1)] |
            Where-Object { $_.PlanId } |
            ForEach-Object { $_.PlanId }
    )
    $entries = $entries[0..($entries.Count - $ExcludeRecentCount - 1)]
}

$filtered = New-Object System.Collections.Generic.List[object]

foreach ($entry in $entries) {
    if ($ExcludePlanIds -contains $entry.PlanId) {
        continue
    }

    $breakdown = Get-ScoreBreakdown -Entry $entry -QueryText $queryText -SearchTerms $searchTerms
    if ($breakdown.Score -le 0) {
        continue
    }

    $filtered.Add([pscustomobject]@{
            PlanId         = $entry.PlanId
            Title          = $entry.Title
            Task           = $entry.Task
            Status         = $entry.Status
            UpdatedAt      = $entry.UpdatedAt
            Targets        = $entry.Targets
            ReferencePlans = $entry.ReferencePlans
            AvoidRepeating = $entry.AvoidRepeating
            LatestNotes    = $entry.LatestNotes
            Score          = $breakdown.Score
            MatchedTerms   = $breakdown.MatchedTerms
            Block          = $entry.Block
        })
}

$ranked = @(
    $filtered |
        Sort-Object -Property @{ Expression = 'Score'; Descending = $true }, @{ Expression = 'PlanId'; Descending = $true } |
        Select-Object -First $Count
)

$qmdFallbackReason = $null
$qmdFallback = [pscustomobject]@{
    Query   = ''
    Results = @()
    Error   = ''
}

if ($UseQmdFallback) {
    $qmdFallbackReason = Get-WeakHitReason -Results $ranked -ScoreThreshold $WeakHitScoreThreshold -MinMatches $WeakHitMinMatches
    if ($qmdFallbackReason) {
        $lexicalPlanIds = @($ranked | Where-Object { $_.PlanId } | ForEach-Object { $_.PlanId })
        $excludedPlanIds = @($ExcludePlanIds + $lexicalPlanIds + $excludedRecentPlanIds)
        $qmdRaw = Invoke-QmdFallback -SearchQuery $Query -Targets $Targets -Limit $QmdCount -Collection $QmdCollection -RootPath $ProjectRoot
        $qmdItems = New-Object System.Collections.Generic.List[object]

        foreach ($candidate in @($qmdRaw.Results)) {
            $planId = Get-PlanIdFromText -Values @($candidate.docid, $candidate.file, $candidate.title, $candidate.snippet)
            if ($planId -and ($excludedPlanIds -contains $planId)) {
                continue
            }

            if (-not $planId -and -not ($candidate.file -match 'plan_' -or $candidate.title -match '计划')) {
                continue
            }

            $matchedEntry = if ($planId -and $entryLookup.ContainsKey($planId)) { $entryLookup[$planId] } else { $null }
            $title = if ($matchedEntry) { $matchedEntry.Title } elseif ($candidate.title) { [string]$candidate.title } else { 'QMD 补充命中' }
            $task = if ($matchedEntry) { $matchedEntry.Task } elseif ($candidate.snippet) { [string]$candidate.snippet } else { '' }
            $status = if ($matchedEntry) { $matchedEntry.Status } else { '' }
            $updatedAt = if ($matchedEntry) { $matchedEntry.UpdatedAt } else { '' }
            $targetsText = if ($matchedEntry) { @($matchedEntry.Targets) } else { @() }
            $referencePlans = if ($matchedEntry) { @($matchedEntry.ReferencePlans) } else { @() }
            $avoidRepeating = if ($matchedEntry) { @($matchedEntry.AvoidRepeating) } else { @() }
            $latestNotes = if ($matchedEntry) { @($matchedEntry.LatestNotes) } else { @() }
            $block = if ($matchedEntry) { $matchedEntry.Block } else { '' }

            $qmdItems.Add([pscustomobject]@{
                    PlanId         = $planId
                    Title          = $title
                    Task           = $task
                    Status         = $status
                    UpdatedAt      = $updatedAt
                    Targets        = $targetsText
                    ReferencePlans = $referencePlans
                    AvoidRepeating = $avoidRepeating
                    LatestNotes    = $latestNotes
                    Score          = if ($candidate.score -ne $null) { [double]$candidate.score } else { 0 }
                    MatchedTerms   = @('qmd-fallback')
                    QmdFile        = [string]$candidate.file
                    QmdSnippet     = [string]$candidate.snippet
                    Block          = $block
                })
        }

        $qmdFallback = [pscustomobject]@{
            Query   = $qmdRaw.Query
            Results = @(
                $qmdItems |
                    Sort-Object -Property @{ Expression = 'Score'; Descending = $true }, @{ Expression = 'PlanId'; Descending = $true } |
                    Select-Object -First $QmdCount
            )
            Error   = $qmdRaw.Error
        }
    }
}

if ($AsJson) {
    [pscustomobject]@{
        Query              = $Query
        Targets            = $Targets
        ExcludeRecentCount = $ExcludeRecentCount
        SearchTerms        = $searchTerms
        Results            = $ranked
        QmdFallback        = [pscustomobject]@{
            Enabled   = [bool]$UseQmdFallback
            Triggered = [bool]$qmdFallbackReason
            Reason    = $qmdFallbackReason
            Query     = $qmdFallback.Query
            Results   = $qmdFallback.Results
            Error     = $qmdFallback.Error
        }
    } | ConvertTo-Json -Depth 8
    return
}

Write-Output "相关计划检索：$Query"
if ($Targets.Count -gt 0) {
    Write-Output "目标线索：$($Targets -join ' | ')"
}

if ($ExcludeRecentCount -gt 0) {
    Write-Output "已排除最近 $ExcludeRecentCount 条计划，避免和 read-recent-plans.ps1 重复。"
}

$displayTerms = if ($searchTerms.Count -gt 16) { @($searchTerms[0..15]) + '...' } else { $searchTerms }
Write-Output "检索词：$($displayTerms -join ', ')"
if ($UseQmdFallback) {
    Write-Output "QMD fallback：$(if ($qmdFallbackReason) { "已触发（$qmdFallbackReason）" } else { '未触发' })"
}
Write-Output ''

if ($ranked.Count -eq 0) {
    Write-Output "未找到相关历史计划。"
} else {
    for ($i = 0; $i -lt $ranked.Count; $i++) {
        $item = $ranked[$i]
        Write-Output "### 相关计划 $($i + 1)"
        Write-Output "- 计划ID：$($item.PlanId)"
        Write-Output "- 标题：$($item.Title)"
        Write-Output "- 相似度分：$($item.Score)"
        $displayMatches = if ($item.MatchedTerms.Count -gt 12) { @($item.MatchedTerms[0..11]) + '...' } else { $item.MatchedTerms }
        Write-Output "- 命中词：$(if ($displayMatches.Count -gt 0) { $displayMatches -join ', ' } else { '无' })"
        Write-Output "- 最新状态：$(if ($item.Status) { $item.Status } else { '未知' })"
        if ($item.UpdatedAt) {
            Write-Output "- 最近更新时间：$($item.UpdatedAt)"
        }
        Write-Output "- 任务：$($item.Task)"
        Write-Output "- 目标：$(if ($item.Targets.Count -gt 0) { $item.Targets -join ' | ' } else { '无' })"
        Write-Output "- 参考计划：$(if ($item.ReferencePlans.Count -gt 0) { $item.ReferencePlans -join ' | ' } else { '无' })"
        Write-Output "- 避免重走：$(if ($item.AvoidRepeating.Count -gt 0) { $item.AvoidRepeating -join ' | ' } else { '无' })"
        Write-Output "- 最近结论：$(if ($item.LatestNotes.Count -gt 0) { $item.LatestNotes -join ' | ' } else { '无' })"
        Write-Output ''
    }
}

if ($qmdFallbackReason) {
    if ($qmdFallback.Error) {
        Write-Output "QMD fallback 失败：$($qmdFallback.Error)"
        return
    }

    if (@($qmdFallback.Results).Count -eq 0) {
        Write-Output "QMD fallback 未补到更多相关计划。"
        return
    }

    for ($i = 0; $i -lt $qmdFallback.Results.Count; $i++) {
        $item = $qmdFallback.Results[$i]
        Write-Output "### QMD 补充计划 $($i + 1)"
        Write-Output "- 计划ID：$(if ($item.PlanId) { $item.PlanId } else { '未解析' })"
        Write-Output "- 标题：$($item.Title)"
        Write-Output "- QMD 分数：$($item.Score)"
        Write-Output "- 任务：$(if ($item.Task) { $item.Task } else { '无' })"
        Write-Output "- 最新状态：$(if ($item.Status) { $item.Status } else { '未知' })"
        if ($item.UpdatedAt) {
            Write-Output "- 最近更新时间：$($item.UpdatedAt)"
        }
        Write-Output "- 目标：$(if ($item.Targets.Count -gt 0) { $item.Targets -join ' | ' } else { '无' })"
        Write-Output "- 避免重走：$(if ($item.AvoidRepeating.Count -gt 0) { $item.AvoidRepeating -join ' | ' } else { '无' })"
        Write-Output "- QMD 来源：$(if ($item.QmdFile) { $item.QmdFile } else { '无' })"
        Write-Output "- QMD 摘要：$(if ($item.QmdSnippet) { $item.QmdSnippet } elseif ($item.LatestNotes.Count -gt 0) { $item.LatestNotes -join ' | ' } else { '无' })"
        Write-Output ''
    }
}
