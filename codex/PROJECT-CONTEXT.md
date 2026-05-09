# ContractGuard Gateway Context

## Truth Layer

- Canonical gateway fallback repo: `E:\My Project\ContractGuard`
- Canonical codex compatibility root: `E:\My Project\ContractGuard\codex`
- Canonical AI behavior gate root: `E:\My Project\ContractGuard\guards\ai-behavior`
- Canonical task pipeline root: `E:\My Project\ContractGuard\tools\task-pipeline`

## Constraint Layer

- Global Codex gateway may fall back to this repo when the active target repo does not provide a complete local `codex/` gate layout.
- This compatibility layer exists to centralize reusable gate entrypoints, not to replace target repo-local source truth.
- Plan and context artifacts created through the compatibility layer stay under `ContractGuard/codex` unless a target repo later provides its own canonical gateway profile.

## Strategy Layer

- Prefer repo-local canonical gateway profiles when they exist and are complete.
- Otherwise route global plan gate and plan ledger bootstrap through this compatibility layer.
- Keep reusable gate logic in `ContractGuard`, and keep target-repo business truth in the target repo.
