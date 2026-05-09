[CmdletBinding(DefaultParameterSetName = 'NewPlan')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'NewPlan')]
    [string]$Title,

    [Parameter(Mandatory = $true, ParameterSetName = 'NewPlan')]
    [string]$Task,

    [Parameter(ParameterSetName = 'NewPlan')]
    [string[]]$Targets = @(),

    [Parameter(ParameterSetName = 'NewPlan')]
    [string[]]$Assumptions = @(),

    [Parameter(ParameterSetName = 'NewPlan')]
    [string[]]$ReferencePlans = @(),

    [Parameter(ParameterSetName = 'NewPlan')]
    [string[]]$AvoidRepeating = @(),

    [Parameter(ParameterSetName = 'NewPlan')]
    [string[]]$Steps = @(),

    [Parameter(ParameterSetName = 'NewPlan')]
    [string[]]$VerificationCriteria = @(),

    [string[]]$LinkedArtifacts = @(),

    [Parameter(ParameterSetName = 'NewPlan')]
    [Parameter(Mandatory = $true, ParameterSetName = 'StatusUpdate')]
    [ValidateSet('计划中', '进行中', '已完成', '已验证', '失败', '已放弃', '已替换')]
    [string]$Status = '计划中',

    [Parameter(ParameterSetName = 'NewPlan')]
    [Parameter(ParameterSetName = 'StatusUpdate')]
    [ValidateSet('auto', 'record', 'skip')]
    [string]$ExperienceDecision = 'auto',

    [Parameter(ParameterSetName = 'NewPlan')]
    [Parameter(Mandatory = $true, ParameterSetName = 'StatusUpdate')]
    [string]$PlanId,

    [Parameter(Mandatory = $true, ParameterSetName = 'StatusUpdate')]
    [switch]$AppendStatusUpdate,

    [Parameter(ParameterSetName = 'StatusUpdate')]
    [string[]]$UpdateNotes = @(),

    [Parameter(ParameterSetName = 'StatusUpdate')]
    [string]$UpdatedAt,

    [string]$ProjectRoot = 'E:\My Project\ContractGuard\codex',
    [string]$FilePath
)

$ErrorActionPreference = 'Stop'

if (-not $FilePath) {
    $FilePath = Join-Path $ProjectRoot 'plugins\obsidian\data\docs\agent\plan.md'
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
$directory = Split-Path -Parent $FilePath
$canonicalPlanPath = Join-Path $ProjectRoot 'plugins\obsidian\data\docs\agent\plan.md'
$scriptDirectory = Split-Path -Parent $PSCommandPath
$planOutcomeSyncScript = Join-Path $scriptDirectory 'sync-plan-outcome-to-experience.mjs'
$maintainPlansScript = Join-Path $scriptDirectory 'maintain-plans.ps1'

if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

function Add-BulletBlock {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Label,
        [string[]]$Items
    )

    if ($Items.Count -eq 0) {
        $Lines.Add("- $Label：无")
        return
    }

    $Lines.Add("- $Label：")
    foreach ($item in $Items) {
        $Lines.Add("  - $item")
    }
}

function Add-NumberedBlock {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Label,
        [string[]]$Items
    )

    if ($Items.Count -eq 0) {
        $Lines.Add("- $Label：无")
        return
    }

    $Lines.Add("- $Label：")
    for ($i = 0; $i -lt $Items.Count; $i++) {
        $Lines.Add("  $($i + 1). $($Items[$i])")
    }
}

function Insert-LinesAt {
    param(
        [string[]]$SourceLines,
        [int]$Index,
        [string[]]$InsertedLines
    )

    $result = New-Object System.Collections.Generic.List[string]

    for ($i = 0; $i -lt $Index; $i++) {
        $result.Add($SourceLines[$i])
    }

    foreach ($line in $InsertedLines) {
        $result.Add($line)
    }

    for ($i = $Index; $i -lt $SourceLines.Count; $i++) {
        $result.Add($SourceLines[$i])
    }

    return $result
}

function Get-UniquePlanId {
    param(
        [string]$Candidate,
        [string]$PlanPath
    )

    $existingContent = ''
    if (Test-Path -LiteralPath $PlanPath) {
        $existingContent = Get-Content -LiteralPath $PlanPath -Raw
    }

    if ([string]::IsNullOrWhiteSpace($existingContent)) {
        return $Candidate
    }

    $resolved = $Candidate
    $suffix = 1
    while ($existingContent -match "(?m)^- 计划ID：$([Regex]::Escape($resolved))\r?$") {
        $resolved = '{0}-{1:d2}' -f $Candidate, $suffix
        $suffix += 1
    }

    return $resolved
}

function Invoke-PlanMaintenance {
    param(
        [string]$PlanPath
    )

    if (-not (Test-Path -LiteralPath $maintainPlansScript)) {
        return
    }

    $outputRoot = $null
    if ([System.IO.Path]::GetFullPath($PlanPath) -ne [System.IO.Path]::GetFullPath($canonicalPlanPath)) {
        $outputRoot = Join-Path (Split-Path -Parent $PlanPath) '.plan-state'
    }

    try {
        $params = @{
            ProjectRoot = $ProjectRoot
            FilePath    = $PlanPath
            Quiet       = $true
        }
        if ($outputRoot) {
            $params.OutputRoot = $outputRoot
        }

        & $maintainPlansScript @params | Out-Null
    } catch {
        Write-Warning "刷新 plan active/rolling/index 失败：$($_.Exception.Message)"
    }
}

if ($PSCmdlet.ParameterSetName -eq 'NewPlan') {
    if (-not $PlanId) {
        $PlanId = Get-UniquePlanId -Candidate ('PLAN-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) -PlanPath $FilePath
    }

    $lines = New-Object System.Collections.Generic.List[string]
    $existingContent = ''

    if (Test-Path -LiteralPath $FilePath) {
        $existingContent = Get-Content -LiteralPath $FilePath -Raw
    }

    if (-not [string]::IsNullOrWhiteSpace($existingContent)) {
        $lines.Add('')
    }

    $lines.Add("## $timestamp - $Title")
    $lines.Add('')
    $lines.Add("- 计划ID：$PlanId")
    $lines.Add("- 任务：$Task")
    Add-BulletBlock -Lines $lines -Label '目标' -Items $Targets
    Add-BulletBlock -Lines $lines -Label '假设' -Items $Assumptions
    Add-BulletBlock -Lines $lines -Label '参考计划' -Items $ReferencePlans
    Add-BulletBlock -Lines $lines -Label '避免重走' -Items $AvoidRepeating
    Add-NumberedBlock -Lines $lines -Label '计划' -Items $Steps
    Add-BulletBlock -Lines $lines -Label '验证标准' -Items $VerificationCriteria
    Add-BulletBlock -Lines $lines -Label '关联产物' -Items $LinkedArtifacts
    $lines.Add("- 经验沉淀决策：$ExperienceDecision")
    $lines.Add("- 状态：$Status")

    Add-Content -LiteralPath $FilePath -Value $lines -Encoding utf8
    Invoke-PlanMaintenance -PlanPath $FilePath

    Write-Host "已追加计划记录：$FilePath"
    Write-Host "计划ID：$PlanId"
    return
}

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "计划文件不存在：$FilePath"
}

$currentLines = @(Get-Content -LiteralPath $FilePath)
$planIdLine = "- 计划ID：$PlanId"
$idIndex = -1

for ($i = 0; $i -lt $currentLines.Count; $i++) {
    if ($currentLines[$i] -eq $planIdLine) {
        $idIndex = $i
        break
    }
}

if ($idIndex -lt 0) {
    throw "未找到计划ID：$PlanId"
}

$insertIndex = $currentLines.Count
for ($i = $idIndex + 1; $i -lt $currentLines.Count; $i++) {
    if ($currentLines[$i] -match '^## ') {
        $insertIndex = $i
        break
    }
}

if (-not $UpdatedAt) {
    $UpdatedAt = $timestamp
}

$updateBlock = New-Object System.Collections.Generic.List[string]
$updateBlock.Add('')
$updateBlock.Add('### 状态更新')
$updateBlock.Add('')
$updateBlock.Add("- 更新时间：$UpdatedAt")
$updateBlock.Add("- 计划ID：$PlanId")
$updateBlock.Add("- 状态：$Status")
$updateBlock.Add("- 经验沉淀决策：$ExperienceDecision")

if ($UpdateNotes.Count -gt 0) {
    $updateBlock.Add('- 补充说明：')
    foreach ($note in $UpdateNotes) {
        $updateBlock.Add("  - $note")
    }
}

if ($LinkedArtifacts.Count -gt 0) {
    $updateBlock.Add('- 关联产物：')
    foreach ($artifact in $LinkedArtifacts) {
        $updateBlock.Add("  - $artifact")
    }
}

$newContent = Insert-LinesAt -SourceLines $currentLines -Index $insertIndex -InsertedLines @($updateBlock)
Set-Content -LiteralPath $FilePath -Value $newContent -Encoding utf8
Invoke-PlanMaintenance -PlanPath $FilePath

Write-Host "已追加状态更新：$FilePath"
Write-Host "计划ID：$PlanId"

if (
    $Status -in @('已完成', '已验证', '失败') -and
    (Test-Path -LiteralPath $planOutcomeSyncScript) -and
    ([System.IO.Path]::GetFullPath($FilePath) -eq [System.IO.Path]::GetFullPath($canonicalPlanPath))
) {
    try {
        $syncOutput = & node $planOutcomeSyncScript --plan-file $FilePath --plan-id $PlanId --status $Status 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "计划结果同步到 experience-manager 失败：$($syncOutput -join [Environment]::NewLine)"
        } elseif ($syncOutput) {
            $syncText = ($syncOutput -join [Environment]::NewLine).Trim()
            $syncResult = $null
            try {
                $syncResult = $syncText | ConvertFrom-Json
            } catch {
                $syncResult = $null
            }

            if ($syncResult -and $syncResult.ok) {
                Write-Host "计划结果已同步到 experience-manager：$PlanId"
            } elseif ($syncResult -and $syncResult.skipped) {
                Write-Host "计划结果未同步到 experience-manager：$PlanId ($($syncResult.reason))"
            } else {
                Write-Host "计划结果同步返回：$syncText"
            }
        }
    } catch {
        Write-Warning "计划结果同步到 experience-manager 失败：$($_.Exception.Message)"
    }
}
