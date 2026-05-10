# Contributing

ContractGuard is the reusable governance root for project contracts, AI behavior gates and safe execution guidance.

## Change Rules

- Keep schema changes backward-compatible unless a migration is documented.
- Update `README.md` and `project.json` when public entrypoints, roots or core commands change.
- Add or update self-tests when changing gate behavior.
- Do not encode one business repository's private runtime facts into generic templates.
- Do not commit secrets, local tokens, private project data or generated runtime output.

## Validation

```bash
node tools/validate-project-contract.mjs project.json
npm run selftest:decision-schema
npm run selftest:guard-regressions
```

Use the closest available test when the full gate suite is not relevant to the change.

## Commit Style

- `feat:` new gate, schema or reusable capability
- `fix:` bug fix
- `docs:` documentation
- `test:` test or fixture changes
- `chore:` maintenance
