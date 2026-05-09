$ProjectRoot = Split-Path -Parent $PSScriptRoot
$env:OLLAMA_MODELS = (Resolve-Path (Join-Path $ProjectRoot '.ollama/models')).Path
$env:OLLAMA_HOST = '127.0.0.1:11435'
$ollama = Join-Path $ProjectRoot '.tools/ollama/ollama.exe'
if (!(Test-Path $ollama)) {
  Write-Error "Ollama executable not found at $ollama"
  exit 1
}
& $ollama pull qwen2.5-coder:7b
