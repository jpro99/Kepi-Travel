import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { buildParseCorrectionRecord } from "@/lib/travelAssistant/mlReadiness/buildParseCorrectionRecord";
import {
  getConfidenceCalibrationStats,
  recordCalibrationFromCorrection,
} from "@/lib/travelAssistant/mlReadiness/confidenceCalibration";
import {
  appendParseCorrection,
  listParseCorrections,
} from "@/lib/travelAssistant/mlReadiness/parseCorrectionStore";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/ml-readiness/parse-corrections",
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/ml-readiness/parse-corrections",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  const [corrections, calibration] = await Promise.all([
    listParseCorrections({ userId, limit: 50 }),
    getConfidenceCalibrationStats({ userId }),
  ]);
  routeLogger.info("Parse correction metrics fetched.", { count: corrections.length });
  return NextResponse.json(
    { ok: true, corrections, calibration },
    { headers: rateLimit.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/ml-readiness/parse-corrections",
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/ml-readiness/parse-corrections",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: rateLimit.headers });
  }

  const body = asRecord(payload);
  const parserGuess = asRecord(body?.parserGuess);
  const corrected = asRecord(body?.corrected);
  const reviewItemId = typeof body?.reviewItemId === "string" ? body.reviewItemId.trim() : "";
  if (!reviewItemId || !parserGuess || !corrected) {
    return NextResponse.json(
      { error: "reviewItemId, parserGuess, and corrected are required." },
      { status: 400, headers: rateLimit.headers },
    );
  }

  const record = buildParseCorrectionRecord({
    reviewItemId,
    parserGuess,
    corrected,
    gateReasons: Array.isArray(body?.gateReasons)
      ? body.gateReasons.filter((entry): entry is string => typeof entry === "string")
      : [],
    sourceChannel: typeof body?.sourceChannel === "string" ? body.sourceChannel : undefined,
    sourceEmailSubject:
      typeof body?.sourceEmailSubject === "string" ? body.sourceEmailSubject : undefined,
    parseConfidenceScore:
      typeof body?.parseConfidenceScore === "number" ? body.parseConfidenceScore : undefined,
    parsingStatus: typeof body?.parsingStatus === "string" ? body.parsingStatus : undefined,
    originalEmailText:
      typeof body?.originalEmailText === "string" ? body.originalEmailText : undefined,
    parserVersion: typeof body?.parserVersion === "string" ? body.parserVersion : undefined,
    outcome: body?.outcome === "accepted" || body?.outcome === "edited-then-accepted" ? body.outcome : undefined,
  });

  const persisted = await appendParseCorrection(record, { userId });
  if (persisted) {
    await recordCalibrationFromCorrection(record, { userId });
  }

  routeLogger.info("Parse correction recorded.", {
    reviewItemId,
    changedFields: record.changedFields,
    outcome: record.outcome,
    persisted,
  });

  return NextResponse.json({ ok: true, persisted, recordId: record.id }, { headers: rateLimit.headers });
}
