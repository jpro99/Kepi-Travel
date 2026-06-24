# AGENTS.md

## Agent instructions

This repository uses a conductor-plus-specialists model for app audits, code review, QA, and guided improvement.

Primary goals:
- audit an existing app end to end
- identify security, UX, architecture, integration, performance, and product issues
- verify real flows instead of making assumptions
- produce structured findings with severity, evidence, and exact fixes
- keep changes safe, reversible, and testable

Operating rules:
- Start with an audit plan before changing code.
- Prefer read-only review first, then propose changes.
- Never claim a bug is fixed until the relevant checks are run.
- Always inspect existing architecture before refactoring.
- Preserve working behavior unless a change is necessary.
- For code changes, use complete files when the user requests full file rewrites.
- Every recommendation must include: issue, impact, evidence, proposed fix, and validation step.
- Use exact file paths in all outputs.
- Use severity labels: critical, high, medium, low, idea.
- Distinguish verified findings from hypotheses.

Review order:
1. repo map
2. app boot and environment check
3. security review
4. UX / flow review
5. integration and data flow review
6. architecture and maintainability review
7. performance and quality review
8. prioritized fix plan

## Review receipt format

Every audit pass must output this structure:

### Summary
- app name
- audit scope
- audit status
- confidence level

### Findings
For each finding:
- id
- severity
- title
- files
- evidence
- impact
- recommended fix
- validation

### Checks run
- commands executed
- pages tested
- APIs tested
- tests passed/failed

### Open questions
- unknowns
- missing credentials
- areas blocked by environment

### Next actions
- immediate fixes
- short-term improvements
- later enhancements

## Test command
- npm run lint
- npm run typecheck
- npm run test
- npm run build

## Build command
- npm run build

## Cursor
- Use `.cursor/rules/` for persistent orchestration and repo-specific behavior.
- Keep rule files small and single-purpose.
- Run read-only investigation before code modification.

## Claude Code
- Use `.claude/agents/` for specialist subagents.
- Route to read-only subagents first.
- Use Playwright MCP for browser flow validation when available.
