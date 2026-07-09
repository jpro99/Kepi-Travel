import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { logSuggestionOutcome } from "@/lib/travelAssistant/mlReadiness/suggestionOutcomeStore";
import type { SuggestionOutcomeKind } from "@/lib/travelAssistant/mlReadiness/types";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_OUTCOMES = new Set<SuggestionOutcomeKind>(["impression", "dismiss", "accept", "click"]);

export async function POST(req: Request): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/ml-readiness/suggestion-outcomes",
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/ml-readiness/suggestion-outcomes",
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

  const body =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  const surface = typeof body?.surface === "string" ? body.surface.trim() : "";
  const suggestionKey = typeof body?.suggestionKey === "string" ? body.suggestionKey.trim() : "";
  const outcome = typeof body?.outcome === "string" ? body.outcome.trim() : "";
  if (!surface || !suggestionKey || !ALLOWED_OUTCOMES.has(outcome as SuggestionOutcomeKind)) {
    return NextResponse.json(
      { error: "surface, suggestionKey, and valid outcome are required." },
      { status: 400, headers: rateLimit.headers },
    );
  }

  const metadata =
    typeof body?.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, string | number | boolean | null>)
      : undefined;

  const persisted = await logSuggestionOutcome(
    {
      surface,
      suggestionKey,
      outcome: outcome as SuggestionOutcomeKind,
      metadata,
    },
    { userId },
  );

  routeLogger.info("Suggestion outcome logged.", { surface, suggestionKey, outcome, persisted });
  return NextResponse.json({ ok: true, persisted }, { headers: rateLimit.headers });
}
