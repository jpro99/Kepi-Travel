import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { mergeNeuroOutcomeMetadata, scoreNeuroLoop } from "@/lib/neuro/neuroLoop";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  listSuggestionOutcomes,
  logSuggestionOutcome,
} from "@/lib/travelAssistant/mlReadiness/suggestionOutcomeStore";
import type { SuggestionOutcomeKind } from "@/lib/travelAssistant/mlReadiness/types";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_OUTCOMES = new Set<SuggestionOutcomeKind>(["impression", "dismiss", "accept", "click"]);

export async function GET(req: Request): Promise<NextResponse> {
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

  const travelerType = new URL(req.url).searchParams.get("travelerType")?.trim() || null;
  const events = await listSuggestionOutcomes({ userId, limit: 1000 });
  const digest = scoreNeuroLoop(events, { travelerType });
  routeLogger.info("Neuro loop digest fetched.", {
    scoredEvents: digest.scoredEvents,
    ghostsExcluded: digest.ghostsExcluded,
    travelerType,
  });
  return NextResponse.json({ ok: true, digest, eventCount: events.length }, { headers: rateLimit.headers });
}

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

  const rawMetadata =
    typeof body?.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, string | number | boolean | null>)
      : undefined;
  const metadata = mergeNeuroOutcomeMetadata(rawMetadata, {
    travelerType: body?.travelerType,
    variant: body?.variant,
    honest: body?.honest,
  });

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
