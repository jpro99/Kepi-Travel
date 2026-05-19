import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const ADVANCED_MODE_KEY = "advanced-mode";

const AdvancedModeBodySchema = z.object({
  enabled: z.boolean(),
});

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/preferences/advanced-mode",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized advanced mode preference request.");
    return NextResponse.json({ enabled: false, persistedToKv: false }, { status: 401 });
  }

  const stored = await kvStoreGet<boolean>(ADVANCED_MODE_KEY, { userId });
  return NextResponse.json({ enabled: stored === true, persistedToKv: true });
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/preferences/advanced-mode",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized advanced mode preference update.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/preferences/advanced-mode",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many preference update requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsed = AdvancedModeBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  await kvStoreSet(ADVANCED_MODE_KEY, parsed.data.enabled, { userId });
  routeLogger.info("Advanced mode preference updated.", { enabled: parsed.data.enabled });
  return NextResponse.json({ enabled: parsed.data.enabled, persistedToKv: true }, { headers: rateLimit.headers });
}
