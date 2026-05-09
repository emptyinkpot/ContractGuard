[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SessionFile,

    [string]$TaskSummary = '',

    [string]$TargetCwd = '',

    [string]$ProjectRoot = 'E:\My Project\ContractGuard',

    [switch]$BlockOnReview,

    [switch]$AlwaysRequire
)

$ErrorActionPreference = 'Stop'

function Get-LastAgentMessageFromSessionFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Session file not found: $Path"
    }

    $entries = Get-Content -LiteralPath $Path -Encoding utf8
    for ($index = $entries.Count - 1; $index -ge 0; $index -= 1) {
        $line = $entries[$index]
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        try {
            $entry = $line | ConvertFrom-Json -Depth 12
        } catch {
            continue
        }

        if ($entry.type -eq 'event_msg' -and $entry.payload.type -eq 'task_complete' -and -not [string]::IsNullOrWhiteSpace($entry.payload.last_agent_message)) {
            return [string]$entry.payload.last_agent_message
        }

        if ($entry.type -eq 'event_msg' -and $entry.payload.type -eq 'agent_message' -and -not [string]::IsNullOrWhiteSpace($entry.payload.message)) {
            return [string]$entry.payload.message
        }

        if ($entry.type -eq 'response_item' -and $entry.payload.type -eq 'message' -and $entry.payload.role -eq 'assistant') {
            foreach ($item in @($entry.payload.content)) {
                if ($item.type -eq 'output_text' -and -not [string]::IsNullOrWhiteSpace($item.text)) {
                    return [string]$item.text
                }
            }
        }
    }

    return ''
}

function Test-RequiresFrontendDesignGate {
    param([string]$Summary, [string]$Message)

    if ($AlwaysRequire) {
        return $true
    }

    if ($Message -match 'FrontendDesignGateInput:') {
        return $true
    }

    $combined = (($Summary + "`n" + $Message).Trim())
    if ([string]::IsNullOrWhiteSpace($combined)) {
        return $false
    }

    $frontendSignal = $combined -match '(?i)\b(frontend|ui|ux|console|dashboard|browser|mobile|layout|visual|design)\b' -or
        $combined -match '前端|界面|控制台|移动端|视觉|设计|改版|重做'
    $redesignSignal = $combined -match '(?i)\b(redesign|refactor|refresh|rework|overhaul|spec)\b' -or
        $combined -match '重做|改版|重构|规范|信息架构|截图'

    return ($frontendSignal -and $redesignSignal)
}

function Get-FrontendDesignJsonFromMessage {
    param([string]$Message)

    if ([string]::IsNullOrWhiteSpace($Message)) {
        return ''
    }

    $patterns = @(
        '(?s)FrontendDesignGateInput:\s*```json\s*(\{.*?\})\s*```',
        '(?s)FrontendDesignGateInput:\s*(\{.*\})'
    )

    foreach ($pattern in $patterns) {
        $match = [regex]::Match($Message, $pattern)
        if ($match.Success) {
            return $match.Groups[1].Value.Trim()
        }
    }

    return ''
}

function Resolve-ArtifactPaths {
    param(
        [pscustomobject]$Payload,
        [string]$BasePath
    )

    if ($null -eq $Payload -or $null -eq $Payload.artifacts) {
        return
    }

    foreach ($fieldName in @('desktopScreenshot', 'mobileScreenshot')) {
        $value = [string]$Payload.artifacts.$fieldName
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }
        if ($value -match '^https?://') {
            continue
        }
        if ([System.IO.Path]::IsPathRooted($value)) {
            continue
        }
        if ([string]::IsNullOrWhiteSpace($BasePath)) {
            continue
        }

        $Payload.artifacts.$fieldName = [System.IO.Path]::GetFullPath((Join-Path $BasePath $value))
    }
}

$gateCli = Join-Path $ProjectRoot 'unified-gates\gates\frontend-design-gate.mjs'
if (-not (Test-Path -LiteralPath $gateCli)) {
    throw "Frontend design gate CLI not found: $gateCli"
}

$lastAgentMessage = Get-LastAgentMessageFromSessionFile -Path $SessionFile
if (-not (Test-RequiresFrontendDesignGate -Summary $TaskSummary -Message $lastAgentMessage)) {
    Write-Output 'Frontend design gate skipped: task does not require frontend-design closeout.'
    exit 0
}

$jsonText = Get-FrontendDesignJsonFromMessage -Message $lastAgentMessage
if ([string]::IsNullOrWhiteSpace($jsonText)) {
    throw 'Frontend design gate blocked: final answer is missing FrontendDesignGateInput JSON.'
}

try {
    $payload = $jsonText | ConvertFrom-Json -Depth 20
} catch {
    throw "Frontend design gate blocked: FrontendDesignGateInput JSON is invalid. $($_.Exception.Message)"
}

if (-not $payload.taskIsNonTrivial) {
    $payload | Add-Member -NotePropertyName taskIsNonTrivial -NotePropertyValue $true -Force
}

Resolve-ArtifactPaths -Payload $payload -BasePath $TargetCwd

$runtimeDir = Join-Path $ProjectRoot '.runtime\frontend-design-gate'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
$inputFile = Join-Path $runtimeDir "frontend-design-gate-$runId.json"
$resultFile = Join-Path $runtimeDir "frontend-design-gate-$runId.result.json"

$payload | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $inputFile -Encoding utf8
$rawResult = & node $gateCli $inputFile
$exitCode = $LASTEXITCODE

if ([string]::IsNullOrWhiteSpace($rawResult)) {
    throw 'Frontend design gate blocked: gate CLI returned no output.'
}

$rawResult | Set-Content -LiteralPath $resultFile -Encoding utf8

try {
    $result = $rawResult | ConvertFrom-Json -Depth 12
} catch {
    throw "Frontend design gate blocked: gate CLI returned invalid JSON. $($_.Exception.Message)"
}

Write-Output "Frontend design gate verdict: $($result.verdict)"
if ($result.errors) {
    foreach ($item in $result.errors) {
        Write-Output "- [block] $item"
    }
}
if ($result.warnings) {
    foreach ($item in $result.warnings) {
        Write-Output "- [review] $item"
    }
}

if ($result.verdict -eq 'block') {
    throw "Frontend design gate blocked this task. Result: $resultFile"
}

if ($result.verdict -eq 'review' -and $BlockOnReview) {
    throw "Frontend design gate requires manual review before closeout. Result: $resultFile"
}

if ($exitCode -ne 0 -and $result.verdict -eq 'allow') {
    throw "Frontend design gate CLI exited non-zero unexpectedly: $exitCode"
}
