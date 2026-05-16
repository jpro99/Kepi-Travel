import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BackgroundRunTimeoutError,
  runManagedTravelUpdateBackgroundPass,
} from "@/lib/travelAssistant/backgroundRunManager";
import { BackgroundRunInProgressError } from "@/lib/travelAssistant/backgroundRunStateStore";
import { RuntimeStateUnavailableError } from "@/lib/travelAssistant/backgroundOrchestrator";
import {
  appendTravelOpsActionAuditEntry,
  findTravelOpsActionReplay,
} from "@/lib/travelAssistant/opsActionAuditStore";
import { resetTravelUpdateCircuitState } from "@/lib/travelAssistant/updateAdapters";
import type { TravelOpsActionResult } from "@/lib/travelAssistant/travelUpdateTypes";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("run-background-once"),
    mode: z.enum(["off", "mock", "auto"]).optional(),
    nowIso: z.string().datetime().optional(),
    timeoutMs: z.number().int().min(250).max(120000).optional(),
    dryRun: z.boolean().optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  }),
  z.object({
    action: z.literal("reset-circuits"),
    idempotencyKey: z.string().min(8).max(128).optional(),
  }),
]);

function isAuthorized(req: Request): boolean {
  const expectedSecret = process.env.TRAVEL_UPDATE_CRON_SECRET?.trim();
  if (!expectedSecret) {
    return true;
  }
  const headerSecret = req.headers.get("x-travel-cron-secret")?.trim();
  const bearerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return headerSecret === expectedSecret || bearerToken === expectedSecret;
}

function resolveActor(req: Request): string {
  return req.headers.get("x-operator-id")?.trim() || "operator";
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized ops control action" }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const actor = resolveActor(req);
  const idempotencyKey = parsed.data.idempotencyKey ?? null;
  const requestedAt = new Date().toISOString();

  if (idempotencyKey) {
    const replay = await findTravelOpsActionReplay({
      action: parsed.data.action,
      idempotencyKey,
    });
    if (replay) {
      return NextResponse.json(
        {
          ...(replay.responsePayload as Record<string, unknown>),
          replayed: true,
          actionAuditId: replay.id,
        },
        { status: replay.statusCode },
      );
    }
  }

  let statusCode = 200;
  let result: TravelOpsActionResult = "success";
  let responsePayload: Record<string, unknown>;
  let responseSummary = "ok";

  if (parsed.data.action === "reset-circuits") {
    resetTravelUpdateCircuitState();
    responsePayload = {
      action: parsed.data.action,
      ok: true,
      cleared: "all",
      clearedAt: new Date().toISOString(),
    };
    responseSummary = "Reset provider circuit memory.";
    const audit = await appendTravelOpsActionAuditEntry({
      action: parsed.data.action,
      actor,
      result,
      requestSummary: "reset all provider circuits",
      responseSummary,
      responsePayload,
      statusCode,
      idempotencyKey,
      replayed: false,
      requestedAt,
    });
    return NextResponse.json({ ...responsePayload, actionAuditId: audit.id, replayed: false }, { status: statusCode });
  }

  try {
    const backgroundRun = await runManagedTravelUpdateBackgroundPass({
      mode: parsed.data.mode,
      nowIso: parsed.data.nowIso,
      timeoutMs: parsed.data.timeoutMs,
      dryRun: parsed.data.dryRun ?? false,
    });
    responsePayload = {
      action: parsed.data.action,
      ok: true,
      backgroundRun,
      dryRun: parsed.data.dryRun ?? false,
    };
    responseSummary =
      parsed.data.dryRun === true
        ? "Dry-run background pass completed."
        : `Managed background pass completed with status ${backgroundRun.status}.`;
  } catch (error) {
    if (error instanceof BackgroundRunInProgressError) {
      statusCode = 409;
      result = "error";
      responsePayload = {
        action: parsed.data.action,
        ok: false,
        error: error.message,
        activeRunId: error.activeRunId,
        activeStartedAt: error.startedAt,
      };
      responseSummary = "Background run skipped due to overlap lock.";
    } else if (error instanceof RuntimeStateUnavailableError) {
      statusCode = 409;
      result = "error";
      responsePayload = {
        action: parsed.data.action,
        ok: false,
        error: error.message,
      };
      responseSummary = "Background run blocked due to missing runtime state.";
    } else if (error instanceof BackgroundRunTimeoutError) {
      statusCode = 504;
      result = "error";
      responsePayload = {
        action: parsed.data.action,
        ok: false,
        error: error.message,
        runId: error.runId,
        timeoutMs: error.timeoutMs,
      };
      responseSummary = "Managed background run timed out.";
    } else {
      throw error;
    }
  }

  const requestSummary =
    parsed.data.dryRun === true
      ? `dry-run background pass (${parsed.data.mode ?? "runtime-default"})`
      : `managed background pass (${parsed.data.mode ?? "runtime-default"})`;
  const audit = await appendTravelOpsActionAuditEntry({
    action: parsed.data.action,
    actor,
    result,
    requestSummary,
    responseSummary,
    responsePayload,
    statusCode,
    idempotencyKey,
    replayed: false,
    requestedAt,
  });
  return NextResponse.json({ ...responsePayload, actionAuditId: audit.id, replayed: false }, { status: statusCode });
}
