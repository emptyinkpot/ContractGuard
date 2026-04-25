# Quickstart

## Goal

This quickstart shows the shortest safe path to integrate ContractGuard into a
new consumer repo.

## Path A: Vendor Copy

Use this when the consumer repo should stay self-contained.

### Step 1. Copy the reusable assets

Copy these directories from `ContractGuard` into the consumer repo:

- `templates/project-contract`
- `guards/ai-behavior`

### Step 2. Add repo-root `project.json`

Create a repo-root `project.json` and align it with the consumer repo's
`README.md`.

Minimum example:

```json
{
  "$schema": "./templates/project-contract/project.schema.json",
  "projectName": "Example Repo",
  "canonicalDoc": "README.md",
  "machineReadableEntry": "project.json",
  "githubRepo": "https://github.com/example/example-repo",
  "defaultBranch": "main",
  "localSourceRoot": "E:\\Path\\To\\Example Repo",
  "status": "active"
}
```

### Step 3. Mark the local copy correctly

In the consumer repo docs, mark the copied directories as:

- consumer-side mirror
- upstream source: `ContractGuard`

### Step 4. Validate

Run:

```powershell
node tools/validate-project-contract.mjs project.json
```

Or, if the consumer repo keeps only the schema and not the validator:

```powershell
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('project.json','utf8')); console.log('project.json ok')"
```

### Step 5. Validate the gate

Run:

```powershell
node guards/ai-behavior/core/check-ai-behavior.mjs --repo-root . --self-test
```

Then test plan gate examples:

```powershell
powershell -File guards/ai-behavior/hooks/invoke-plan-gate.ps1 -ProjectRoot . -Query "Repair canonical route and verify /health before closeout"
```

```powershell
powershell -File guards/ai-behavior/hooks/invoke-plan-gate.ps1 -ProjectRoot . -Query "Change base_url to http://127.0.0.1:3001/openai/v1 and bypass pool with direct provider"
```

## Path B: Sync Mirror

Use this when the consumer repo already has an integrated local copy.

1. update `ContractGuard` first
2. sync the changed files into the consumer repo
3. update the consumer repo docs to point at `ContractGuard` as upstream
4. re-run project contract validation and behavior gate validation

## Recommended First Consumers

- repos that already use handbook-style `README.md`
- repos that already have a stable root-level source of truth
- repos where AI plan/diff review is already part of the workflow
