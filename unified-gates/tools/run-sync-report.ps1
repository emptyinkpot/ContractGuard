param(
  [switch]$DryRun,
  [switch]$Report,
  [switch]$ValidateReport,
  [switch]$Schema,
  [string]$OutFile
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$syncScript = Join-Path $scriptDir "sync-all.mjs"
$nodeExe = "C:\Program Files\nodejs\node.exe"

if (-not (Test-Path -LiteralPath $nodeExe)) {
  throw "Node executable not found at $nodeExe"
}

if (-not (Test-Path -LiteralPath $syncScript)) {
  throw "sync-all.mjs not found at $syncScript"
}

$args = @($syncScript)

if ($DryRun) {
  $args += "--dry-run"
}

if ($Report) {
  $args += "--report"
}

if ($ValidateReport) {
  $args += "--validate-report"
}

if ($Schema) {
  $args += "--schema"
}

$output = & $nodeExe @args
$exitCode = $LASTEXITCODE

if ($OutFile) {
  $outDir = Split-Path -Parent $OutFile
  if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($OutFile, ($output -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
}

if ($null -ne $output) {
  $output | Write-Output
}

exit $exitCode
