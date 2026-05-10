# Security Policy

ContractGuard defines guardrails and project contracts. It should not store operational secrets.

## Do Not Commit

- API keys
- OAuth tokens
- cookies
- private keys
- production `.env` files
- private consumer repository data
- generated runtime artifacts containing sensitive content

## Safe Content

- Generic schemas
- Generic policy examples
- Placeholder secrets such as `<token>`
- Non-secret project contract templates
- Test fixtures that do not contain live credentials

## Reporting

Report security issues privately to the repository owner/operator. Include a minimal reproduction, affected gate or schema path, and whether the issue can cause unsafe allow/review/block decisions.
