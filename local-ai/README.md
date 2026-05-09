# Local Ollama Setup

This project stores its local Ollama tooling under `.tools/ollama` and its model data under `.ollama/models`.

## Key paths
- Binary: `.tools/ollama/ollama.exe`
- Models: `.ollama/models`
- Modelfile: `local-ai/Modelfile`
- Start helper: `scripts/start-local-ollama.ps1`
- Pull helper: `scripts/pull-qwen2.5-coder.ps1`
- Host: `127.0.0.1:11435`

## Typical usage
```powershell
./scripts/start-local-ollama.ps1
$env:OLLAMA_MODELS = (Resolve-Path ./.ollama/models).Path
$env:OLLAMA_HOST = '127.0.0.1:11435'
./.tools/ollama/ollama.exe list
./.tools/ollama/ollama.exe run qwen2.5-coder:7b
```

## Current status
- `qwen2.5-coder:7b` has been pulled into `.ollama/models`.
- If model execution fails with a memory error, free RAM and retry or reboot before starting the project-local Ollama server.
