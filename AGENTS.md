# AI Content Operating System — Agent Workspace Rules

This repository follows the Master Development Directive and GSD Methodology. All agents operating in this workspace must enforce the modular rules defined in `.agents/rules/` and utilize the specialized skills in `.agents/skills/`.

## Mandatory Rules
- @[System Architecture](.agents/rules/system-architecture.md)
- @[Coding Conventions](.agents/rules/coding-conventions.md)
- @[TypeScript Standards](.agents/rules/typescript-standards.md)
- @[Docker Conventions](.agents/rules/docker-conventions.md)
- @[Database Migration Rules](.agents/rules/database-migration-rules.md)
- @[Security Requirements](.agents/rules/security-requirements.md)
- @[Testing Requirements](.agents/rules/testing-requirements.md)
- @[Documentation Standards](.agents/rules/documentation-standards.md)

## Windows Host Note
When running host commands in Windows PowerShell where `.ps1` script execution is restricted, invoke Node package managers via `npm.cmd` and `npx.cmd` or execute inside Docker containers.
