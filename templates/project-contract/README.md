# Project Contract Template

This template defines the recommended machine-readable project entry for
repo-managed engineering repos under the Atramenti / Codex baseline.

## Files

- `project.schema.json`
  - JSON Schema for repo-root `project.json`
- `frontend-ui-contract.template.md`
  - lightweight page-level UI contract template
- `frontend-design-closeout.schema.json`
  - JSON Schema for CI closeout evidence of component-source and visual-regression gates

## Purpose

Use this template when a repo needs a stable machine-readable entry that can be
consumed by:

- execution gateway profile resolution
- repo-aware agents
- local wrappers and automation
- handbook generation and project bootstrapping
- lightweight frontend UI contract and closeout gate adoption

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

For frontend work, the recommended minimal stack is:

1. author a short page-level contract from `frontend-ui-contract.template.md`
2. enforce legal component sources in CI
3. enforce screenshot or visual-regression checks in CI
4. optionally attach a lightweight lint report for token and typography drift

## Validation Hint

You can validate a repo-root `project.json` with a lightweight local check, for
example:

```powershell
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('project.json','utf8')); console.log('project.json ok')"
```
