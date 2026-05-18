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

### Scheduler/deadman expectations

- Configure expected cadence with:
  - `TRAVEL_UPDATE_SCHEDULE_INTERVAL_MINUTES`
  - `TRAVEL_UPDATE_SCHEDULE_JITTER_MINUTES`
- Ops now exposes:
  - `expectedNextRunBy`
  - `minutesUntilExpectedRun`
  - `missedSchedule`

If `missedSchedule` is true repeatedly, treat as a scheduling incident even when providers are healthy.

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

### Trigger alert sweep

```json
{
  "action": "trigger-alert-sweep",
  "force": true,
  "idempotencyKey": "alert-sweep-2026-06-21T10-32"
}
```

- Executes alert derivation/delivery immediately.
- Use `force: true` to bypass cooldown when validating integrations.

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

### D) Missed scheduler window

Symptoms:
- Worker shows `missedSchedule=true`.
- `expectedNextRunBy` is in the past and drift keeps growing.

Actions:
1. Verify external scheduler/cron is still invoking `/api/travel-updates/background`.
2. Trigger one manual `run-background-once` action to re-establish heartbeat.
3. Confirm `expectedNextRunBy` shifts forward and missed flag clears.

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
- Alert cooldown state: `TRAVEL_UPDATE_ALERT_STATE_PATH`
- Alert sweep audit: `TRAVEL_UPDATE_ALERT_AUDIT_PATH`

Use these logs when investigating inconsistent trip status transitions or missed update windows.

## 6) Alerting channels (stub-first)

Optional notifier endpoints:

- `TRAVEL_ALERT_WEBHOOK_URL`
- `TRAVEL_ALERT_EMAIL_ENDPOINT`
- `TRAVEL_ALERT_SMS_ENDPOINT`
- `TRAVEL_ALERT_CONSOLE_ENABLED`

Alert sweep triggers on:

- worker unhealthy,
- missed schedule / stale heartbeat,
- repeated background failures,
- critical governance blockers.
