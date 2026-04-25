# Project Contract Template

This template defines the recommended machine-readable project entry for
repo-managed engineering repos under the Atramenti / Codex baseline.

## Files

- `project.schema.json`
  - JSON Schema for repo-root `project.json`

## Purpose

Use this template when a repo needs a stable machine-readable entry that can be
consumed by:

- execution gateway profile resolution
- repo-aware agents
- local wrappers and automation
- handbook generation and project bootstrapping

## Expected Pairing

The standard pairing is:

- `README.md`
  - human-facing canonical handbook
- `project.json`
  - machine-facing canonical project contract

## Minimum Required Fields

- `projectName`
- `canonicalDoc`
- `machineReadableEntry`
- `githubRepo`
- `defaultBranch`
- `localSourceRoot`
- `status`

## Optional Expansion Fields

Use these when the repo exposes the matching control-plane surface:

- `codexRoot`
- `capabilityRoots`
- `canonicalDocs`
- `executionGateway`
- `installEntry`
- runtime/public-entry fields such as `publicConsoleUrl`, `publicBaseUrl`, `healthUrl`

## Usage Rule

When a repo adopts this contract:

1. keep `project.json` at the repo root
2. keep `README.md` as the human-facing canonical handbook
3. make `executionGateway.mode` explicit when the repo participates in gateway
   plan/profile enforcement
4. keep `project.json` and `README.md` aligned in the same change cycle

## Validation Hint

You can validate a repo-root `project.json` with a lightweight local check, for
example:

```powershell
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('project.json','utf8')); console.log('project.json ok')"
```
