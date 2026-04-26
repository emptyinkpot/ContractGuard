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

## User Instruction Fidelity

- User wording wins over optimization, rewrite, or structure advice.
- If the user says `directly absorb`, `directly replace`, `verbatim`, or `do not revise`, preserve wording, structure, and tone unless the user explicitly asks for edits.
- If the user allows formatting cleanup only, limit changes to Markdown and obvious layout fixes; do not change meaning, order, or section structure.
- For replacement work, use the latest user-confirmed draft as the only active source.
- For replacement tasks, replace first; do not switch into suggestion or review mode unless asked.
