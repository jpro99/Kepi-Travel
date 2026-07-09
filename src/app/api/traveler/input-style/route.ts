import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  mergeInputStyleIntoGenome,
  recordInputStyleEvent,
  suggestInputStyleShortcut,
} from "@/lib/travelAssistant/inputStyleProfile";
import { getTravelerGenome, saveTravelerGenome } from "@/lib/traveler/travelerGenomeStore";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/traveler/input-style",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: rateLimit.headers });
  }

  const genome = await getTravelerGenome(userId);
  const suggestion = suggestInputStyleShortcut(genome.inputStyle);
  return NextResponse.json({ ok: true, suggestion, profile: genome.inputStyle ?? null }, { headers: rateLimit.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({ requestId, userId, route: "/api/traveler/input-style" });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  const channel = typeof body?.channel === "string" ? body.channel : "unknown";
  const corrected = Boolean(body?.corrected);

  const genome = await getTravelerGenome(userId);
  const profile = recordInputStyleEvent(genome.inputStyle, { channel, corrected });
  await saveTravelerGenome(mergeInputStyleIntoGenome(genome, profile), userId);
  routeLogger.info("Input style event recorded.", { channel, corrected });
  return NextResponse.json({ ok: true, profile, suggestion: suggestInputStyleShortcut(profile) });
}
