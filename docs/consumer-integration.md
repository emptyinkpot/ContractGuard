# Consumer Integration

## Purpose

This document describes how a consumer repo should integrate ContractGuard
without confusing local integration copies with the upstream source.

## Recommended Integration Modes

### 1. Vendor Copy

Use when:

- the consumer repo must stay self-contained
- the gate needs local path references
- immediate cross-repo wiring is not ready

Copy these directories into the consumer repo:

- `templates/project-contract`
- `guards/ai-behavior`

Then mark them as:

- consumer-side mirror
- upstream source: `ContractGuard`

### 2. Sync Mirror

Use when:

- the consumer repo already has a local integrated copy
- updates are applied upstream first, then synced down

Working rule:

1. change `ContractGuard` first
2. sync the changed files into the consumer repo
3. update the consumer repo docs to keep the upstream pointer explicit

### 3. Direct Reference

Use when:

- the local environment can safely call files from the `ContractGuard` root
- the consumer repo does not need a vendored copy

This mode is stronger but should be adopted only after path, portability, and
execution-gateway expectations are stable.

## Consumer Repo Checklist

When integrating into a repo:

1. add or update repo-root `project.json`
2. align repo-root `README.md`
3. decide whether the repo keeps a vendored copy or a direct reference
4. if vendored, mark the local copy as `consumer-side mirror`
5. validate:
   - `project.json`
   - behavior gate self-test
   - plan gate safe/risky examples

## Atramenti-Console Current Mode

Current mode:

- `Atramenti-Console` uses `Vendor Copy + Sync Mirror`

Current integrated paths:

- `E:\My Project\Atramenti-Console\codex\templates\project-contract`
- `E:\My Project\Atramenti-Console\codex\guards\ai-behavior`

Upstream source:

- `E:\My Project\ContractGuard`


## Frontend UI Contract Lite Integration

For consumer repos that ship UI, adopt the minimal frontend stack in this order:

1. copy `templates/project-contract/frontend-ui-contract.template.md` into a repo-local
   `ui-contracts/` directory
2. keep one short contract file per page or major surface
3. wire CI to emit a closeout JSON that matches
   `templates/project-contract/frontend-design-closeout.schema.json`
4. run `guards/ai-behavior/core/check-frontend-design-closeout.mjs`
   against that closeout JSON

Recommended hard gates:

- component sources must come from approved UI/component roots
- visual regression must pass before merge

Optional light gate:

- lint report for spacing tokens, typography presets, and inline-style bans
