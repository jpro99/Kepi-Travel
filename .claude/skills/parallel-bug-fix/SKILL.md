# Parallel Bug Fix Skill

## When to invoke
Any non-trivial bug spanning more than one file or concern.

## Agent roster

| Agent | Responsibility | Files |
|-------|---------------|-------|
| A1-Reproduce | Capture exact failing behavior, logs, timing | read-only |
| A2-Frontend | UI, state machines, client-side fetch, rendering | client files |
| A3-Backend | API routes, auth, database, Redis, external APIs | server files |
| A4-Config | env vars, build config, deployment, dependencies | config files |
| A5-Tests | run existing tests, add smallest locking test | test files |
| A6-Skeptic | propose 3 alternative root causes, invalidate weak ones | read-only |

## Rules
- No two agents own the same file
- Diagnosis is parallel; implementation is sequential unless worktrees isolate writes
- Every agent returns: root cause, confidence %, files, evidence, minimal fix
- Skeptic agent invalidates alternatives before execution begins
- Synthesize → execute → verify — never skip verification

## Output template

```
ROOT CAUSE: [one sentence]
CONFIDENCE: [high/medium/low]
FILES: [list]
EVIDENCE: [specific lines/logs/timing]
FIX: [minimal change description]
```

## Verification checklist
- [ ] `npm run build` passes
- [ ] `npm run test:adapters` passes (91 tests)
- [ ] Original issue reproduced and confirmed fixed
- [ ] No regression in adjacent features
