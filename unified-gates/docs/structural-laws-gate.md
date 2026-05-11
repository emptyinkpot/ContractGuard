# Structural Laws Gate

`structural-laws-gate.mjs` is the canonical executable gate for structural absolutism rules.

It enforces:

- single canonical path
- root-cause layer fixing
- delete or collapse before add
- no compatibility or fallback path
- no script-driven patch surface
- no helper, adapter, wrapper, bridge, shim, or normalizer patch
- no silent tolerance
- no hidden state
- no hardcoding proof gaps

## Modes

### proof

Command:

```powershell
node "E:\My Project\ContractGuard\unified-gates\gates\structural-laws-gate.mjs" input.json
```

Requires explicit structural proof:

- `canonicalPath`
- `rootCause`
- `minimalChangeProof`
- `entropyDelta`
- `forbiddenSurfaces`
- optional `touchedPaths`

### staged

Command:

```powershell
node "E:\My Project\ContractGuard\unified-gates\gates\structural-laws-gate.mjs" --mode staged --repo-root <repo>
```

Scans staged text files and staged entropy.

Blocks:

- forbidden structural surface names in staged paths
- silent catch / catch-ignore
- `return []` / `return {}`
- `?? []` / `?? {}`
- fallback / compat / legacy / shim identifiers
- added files without deletion evidence unless `architectureUpgradeAuthorized` is provided through proof mode
- optional `structural-topology.json` import graph and topology rules
- `facts.structuralDiff` structural change summary

### tracked

Command:

```powershell
node "E:\My Project\ContractGuard\unified-gates\gates\structural-laws-gate.mjs" --mode tracked --repo-root <repo>
```

Scans all tracked text files. This is intentionally strict and may block legacy repositories until they are cleaned.

## Topology Contract

When a repository contains `structural-topology.json` at its root, staged and tracked scans enforce it.

Example:

```json
{
  "layers": [
    { "name": "domain", "root": "features/story/domain" },
    { "name": "application", "root": "features/story/application" },
    { "name": "view", "root": "features/story/view" }
  ],
  "allowedImports": {
    "view": ["application", "domain"],
    "application": ["domain"],
    "domain": []
  },
  "allowedRoots": ["features", "product", "shared", "structural-topology.json"],
  "owners": {
    "features/story/**": "story",
    "features/billing/**": "billing"
  },
  "allowedOwnerImports": {
    "story": [],
    "billing": []
  },
  "requiredChildren": [
    {
      "parentGlob": "features/*",
      "children": ["domain", "application", "view"]
    }
  ],
  "publicEntrypoints": ["features/story/index.ts"]
}
```

The gate blocks:

- layer import direction violations
- unknown layer references
- paths outside `allowedRoots`
- cross-owner imports not listed in `allowedOwnerImports`
- missing required children under matching parents
- direct relative imports into `/internal/` paths that bypass public entrypoints
- duplicate mechanical capability names under the same owner, such as multiple parser / validator / resolver / publisher files

The gate builds dependency edges before evaluating topology:

```json
{
  "fromPath": "features/story/domain/model.ts",
  "fromLayer": "domain",
  "fromOwner": "story",
  "specifier": "../view/render",
  "targetPath": "features/story/view/render",
  "targetLayer": "view",
  "targetOwner": "story",
  "relative": true
}
```

Topology rules must be evaluated from these edges, not by adding separate scanners.

## Structural Diff

In `staged` mode, the gate emits:

```json
{
  "facts": {
    "structuralDiff": {
      "addedFiles": [],
      "modifiedFiles": [],
      "deletedFiles": [],
      "addedDirectories": [],
      "addedLayerRoots": [],
      "addedOwnerRoots": []
    }
  }
}
```

This is the canonical structural delta. Other checks must reuse it instead of creating separate diff scanners.

## Duplicate Capability Detector

The first detector is intentionally mechanical. Within one owner, multiple files whose names contain the same capability term are blocked.

Initial capability terms:

- parser
- publisher
- resolver
- scheduler
- scanner
- transform
- validator

AST-level semantic duplicate detection is a later stage and must stay inside this gate.

## Contract

The gate emits:

```json
{
  "ok": false,
  "verdict": "block",
  "gateFamily": "structural-laws",
  "mode": "staged",
  "enforcedPolicy": [],
  "facts": {},
  "errors": []
}
```

`verdict: "allow"` is the only pass state.
