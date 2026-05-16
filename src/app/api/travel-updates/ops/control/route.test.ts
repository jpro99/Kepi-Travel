import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { POST } from "@/app/api/travel-updates/ops/control/route";
import { readTravelBackgroundRunState } from "@/lib/travelAssistant/backgroundRunStateStore";
import { persistTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";

const BASE_URL = "http://localhost/api/travel-updates/ops/control";

test("ops control reset-circuits action supports idempotent replay", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "travel-ops-control-route-test-"));
  const opsAuditPath = join(tempDir, "ops-audit.json");
  const alertStatePath = join(tempDir, "alert-state.json");

  const previousOpsAuditPath = process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH;
  const previousAlertStatePath = process.env.TRAVEL_UPDATE_ALERT_STATE_PATH;
  const previousCronSecret = process.env.TRAVEL_UPDATE_CRON_SECRET;

  process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH = opsAuditPath;
  process.env.TRAVEL_UPDATE_ALERT_STATE_PATH = alertStatePath;
  delete process.env.TRAVEL_UPDATE_CRON_SECRET;

  try {
    const firstReq = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-circuits", idempotencyKey: "reset-circuits-unique-key" }),
    });
    const firstResp = await POST(firstReq);
    const firstBody = (await firstResp.json()) as { replayed?: boolean; actionAuditId?: string };
    assert.equal(firstResp.status, 200);
    assert.equal(firstBody.replayed, false);

    const secondReq = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-circuits", idempotencyKey: "reset-circuits-unique-key" }),
    });
    const secondResp = await POST(secondReq);
    const secondBody = (await secondResp.json()) as { replayed?: boolean; actionAuditId?: string };
    assert.equal(secondResp.status, 200);
    assert.equal(secondBody.replayed, true);
    assert.equal(secondBody.actionAuditId, firstBody.actionAuditId);
  } finally {
    if (previousOpsAuditPath === undefined) delete process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH;
    else process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH = previousOpsAuditPath;
    if (previousAlertStatePath === undefined) delete process.env.TRAVEL_UPDATE_ALERT_STATE_PATH;
    else process.env.TRAVEL_UPDATE_ALERT_STATE_PATH = previousAlertStatePath;
    if (previousCronSecret === undefined) delete process.env.TRAVEL_UPDATE_CRON_SECRET;
    else process.env.TRAVEL_UPDATE_CRON_SECRET = previousCronSecret;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ops control run-background-once dryRun does not mutate background run state", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "travel-ops-control-route-test-"));
  const opsAuditPath = join(tempDir, "ops-audit.json");
  const alertStatePath = join(tempDir, "alert-state.json");
  const runtimeStatePath = join(tempDir, "runtime-state.json");
  const backgroundStatePath = join(tempDir, "background-state.json");
  const backgroundLockPath = join(tempDir, "background.lock");

  const previousOpsAuditPath = process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH;
  const previousAlertStatePath = process.env.TRAVEL_UPDATE_ALERT_STATE_PATH;
  const previousRuntimeStatePath = process.env.TRAVEL_UPDATE_RUNTIME_STATE_PATH;
  const previousBackgroundStatePath = process.env.TRAVEL_UPDATE_BACKGROUND_STATE_PATH;
  const previousBackgroundLockPath = process.env.TRAVEL_UPDATE_BACKGROUND_LOCK_PATH;
  const previousCronSecret = process.env.TRAVEL_UPDATE_CRON_SECRET;

  process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH = opsAuditPath;
  process.env.TRAVEL_UPDATE_ALERT_STATE_PATH = alertStatePath;
  process.env.TRAVEL_UPDATE_RUNTIME_STATE_PATH = runtimeStatePath;
  process.env.TRAVEL_UPDATE_BACKGROUND_STATE_PATH = backgroundStatePath;
  process.env.TRAVEL_UPDATE_BACKGROUND_LOCK_PATH = backgroundLockPath;
  delete process.env.TRAVEL_UPDATE_CRON_SECRET;

  try {
    await persistTravelRuntimeState({
      storagePath: runtimeStatePath,
      mode: "mock",
      updatedAt: "2026-06-21T10:00:00.000Z",
      reservations: [
        {
          id: "flight-1",
          type: "flight",
          title: "DL 407 JFK -> SFO",
          confirmationCode: "Y8Q4D2",
          localTime: "2026-06-22 08:15",
          location: "Terminal 4, JFK",
          timezone: "America/New_York",
        },
      ],
    });

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "run-background-once",
        mode: "mock",
        dryRun: true,
        timeoutMs: 5000,
        idempotencyKey: "dry-run-unique-key",
      }),
    });
    const response = await POST(request);
    const body = (await response.json()) as {
      ok?: boolean;
      dryRun?: boolean;
      backgroundRun?: { dryRun?: boolean };
      replayed?: boolean;
    };

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.backgroundRun?.dryRun, true);
    assert.equal(body.replayed, false);

    const state = await readTravelBackgroundRunState(backgroundStatePath);
    assert.equal(state.activeRun, null);
    assert.equal(state.lastRun, null);
    assert.equal(state.heartbeat.totalRuns, 0);
  } finally {
    if (previousOpsAuditPath === undefined) delete process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH;
    else process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH = previousOpsAuditPath;
    if (previousAlertStatePath === undefined) delete process.env.TRAVEL_UPDATE_ALERT_STATE_PATH;
    else process.env.TRAVEL_UPDATE_ALERT_STATE_PATH = previousAlertStatePath;
    if (previousRuntimeStatePath === undefined) delete process.env.TRAVEL_UPDATE_RUNTIME_STATE_PATH;
    else process.env.TRAVEL_UPDATE_RUNTIME_STATE_PATH = previousRuntimeStatePath;
    if (previousBackgroundStatePath === undefined) delete process.env.TRAVEL_UPDATE_BACKGROUND_STATE_PATH;
    else process.env.TRAVEL_UPDATE_BACKGROUND_STATE_PATH = previousBackgroundStatePath;
    if (previousBackgroundLockPath === undefined) delete process.env.TRAVEL_UPDATE_BACKGROUND_LOCK_PATH;
    else process.env.TRAVEL_UPDATE_BACKGROUND_LOCK_PATH = previousBackgroundLockPath;
    if (previousCronSecret === undefined) delete process.env.TRAVEL_UPDATE_CRON_SECRET;
    else process.env.TRAVEL_UPDATE_CRON_SECRET = previousCronSecret;
    await rm(tempDir, { recursive: true, force: true });
  }
});
