# Adaptive Travel Ops Runbook

This runbook covers how to operate and recover the travel update pipeline in production.

## 1) Health model

### Overall health (`/api/travel-updates/ops`)

- **green**: runtime snapshot fresh, worker heartbeat healthy, no provider degradation.
- **yellow**: approaching staleness, provider errors without open circuits, or worker degraded.
- **red**: stale runtime snapshot, open provider circuit, worker unhealthy, or stuck background run.

### Worker health (separate from provider health)

Worker health is about orchestration reliability, not upstream APIs.

- **healthy**: regular successful background runs.
- **degraded**: recent failures, run in progress, or heartbeat nearing deadman threshold.
- **unhealthy**: consecutive failures, deadman breach, or active run appears stuck.

## 2) Control actions

Endpoint: `POST /api/travel-updates/ops/control`

Auth: same secret policy as background endpoint (`x-travel-cron-secret` or Bearer token when configured).

### Run background once

```json
{
  "action": "run-background-once",
  "mode": "auto",
  "timeoutMs": 45000,
  "dryRun": false,
  "idempotencyKey": "run-once-2026-06-21T10-30"
}
```

- Use `dryRun: true` for non-mutating checks.
- Reuse `idempotencyKey` when retrying the same operator action to avoid duplicate execution.

### Reset circuits

```json
{
  "action": "reset-circuits",
  "idempotencyKey": "reset-circuits-2026-06-21T10-31"
}
```

- Clears in-memory provider circuit state.
- Use after provider recovery confirmation.

## 3) Common incident playbooks

### A) Runtime snapshot stale

Symptoms:
- Ops health yellow/red with stale runtime reason.

Actions:
1. Trigger `run-background-once` in `auto` mode.
2. If no runtime reservations, execute an interactive sync from `/travel-assistant` to refresh runtime state.
3. Confirm stale minutes drop and health recovers.

### B) Worker unhealthy

Symptoms:
- Worker health is `unhealthy`.
- Heartbeat stale or consecutive failure count growing.

Actions:
1. Run `run-background-once` with `dryRun: true` to validate current provider/runtime path.
2. Run `run-background-once` with `dryRun: false`.
3. If overlap lock persists, verify no stuck process and wait for timeout release.
4. Confirm heartbeat (`lastSuccessfulRunAt`) advances and consecutive failures reset to 0.

### C) Provider circuit open

Symptoms:
- Red health with circuit-open reasons.

Actions:
1. Verify upstream provider availability.
2. Execute `reset-circuits` action.
3. Trigger immediate provider check or managed background run.
4. Confirm circuits close and errors clear.

## 4) Operational checks before allowing GREEN trip state

GREEN should only be granted when:

- required readiness checklist is complete,
- no high-severity timeline conflicts remain,
- runtime snapshot is fresh,
- worker is not unhealthy,
- background run status is not failed/timeout.

The app surfaces these as explicit blockers with remediation steps.

## 5) Audit sources

- Transport event audit: configured via `TRAVEL_UPDATE_AUDIT_PATH`
- Runtime state: configured via `TRAVEL_UPDATE_RUNTIME_STATE_PATH`
- Background run state/heartbeat: `TRAVEL_UPDATE_BACKGROUND_STATE_PATH`
- Ops action audit: `TRAVEL_UPDATE_OPS_AUDIT_PATH`

Use these logs when investigating inconsistent trip status transitions or missed update windows.
