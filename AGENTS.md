# ContractGuard Project Rules

## Scope

- This file applies to `E:\My Project\ContractGuard`.
- `README.md` is the human-facing project handbook.
- `project.json` is the machine-facing project entry.

## Source Of Truth

- repo root: `E:\My Project\ContractGuard`
- handbook: `E:\My Project\ContractGuard\README.md`
- machine entry: `E:\My Project\ContractGuard\project.json`
- behavior gate root: `E:\My Project\ContractGuard\guards\ai-behavior`
- contract schema root: `E:\My Project\ContractGuard\templates\project-contract`

## Working Rule

- Keep `README.md` and `project.json` aligned in the same change cycle.
- Keep canonical gate logic only under `guards\ai-behavior`.
- Keep reusable project contract logic only under `templates\project-contract`.
