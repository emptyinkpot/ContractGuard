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
powershell -File guards/ai-behavior/hooks/invoke-plan-gate.ps1 -ProjectRoot . -Query "Change base_url to http://127.0.0.1:3001/openai/v1 and replace the canonical gateway with a direct provider path"
```

For diff-gate validation against local unstaged changes:

```powershell
powershell -File guards/ai-behavior/hooks/invoke-diff-gate.ps1 -RepoPath . -ProjectRoot . -UseWorkingTree
```

### Step 6. Try the local task pipeline

Run:

```powershell
node tools/task-pipeline/run-task-pipeline.mjs --self-test
```

Or pass a goal directly:

```powershell
node tools/task-pipeline/run-task-pipeline.mjs --goal "Design a safe local SDK integration plan for a consumer repo"
```

Or provide an explicit policy file:

```powershell
node tools/task-pipeline/run-task-pipeline.mjs --policy tools/task-pipeline/policy/task-pipeline-policy.json --goal "Design a safe local SDK integration plan for a consumer repo"
```

Expected result:

- the goal is compiled into analysis, design, and codegen steps
- the local plan gate can refine blocked steps into smaller executable units
- the safety verifier marks controlled-local or handoff conditions before execution
- the staged executor runs approved steps phase by phase and records stage-level trace
- the diff gate reports execution drift and the trace auditor reports audit closure
- the output contains `policyPath`, `compiledSteps`, `plannedSteps`, `planGate`, `safetyVerifier`, `steps`, `results`, `diffGate`, `auditLog`, and `trace`

### Step 7. Preview unified-gates policy sync output

Run:

```powershell
E:\My Project\ContractGuard\unified-gates\tools\run-sync-report.ps1 -Report
```

To validate the generated report structure:

```powershell
E:\My Project\ContractGuard\unified-gates\tools\run-sync-report.ps1 -ValidateReport -Report
```

To write audit-friendly local artifacts:

```powershell
E:\My Project\ContractGuard\unified-gates\tools\run-sync-report.ps1 -Report -OutFile C:\Users\ASUS-KL\.codex\.tmp\sync-report.json
E:\My Project\ContractGuard\unified-gates\tools\run-sync-report.ps1 -ValidateReport -Report -OutFile C:\Users\ASUS-KL\.codex\.tmp\sync-validation.json
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
