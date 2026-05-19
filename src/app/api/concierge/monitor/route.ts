import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserPlan, requiresConcierge } from "@/lib/billing/planGate";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  getProactiveMonitoringState,
  setProactiveAutoRebook,
  startProactiveMonitoring,
  stopProactiveMonitoring,
} from "@/lib/travelAssistant/proactiveAlertService";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";

const PostBodySchema = z.object({
  tripId: z.string().trim().min(1).max(128),
  autoRebook: z.boolean().optional(),
});

const DeleteBodySchema = z.object({
  tripId: z.string().trim().min(1).max(128),
});

function conciergeForbiddenResponse() {
  return NextResponse.json(
    {
      error: "Concierge plan is required for proactive monitoring.",
      requiresConciergeFeature: requiresConcierge("concierge-monitoring") ? "concierge-monitoring" : "concierge",
    },
    { status: 402 },
  );
}

async function authorize(req: Request): Promise<
  | {
      ok: true;
      userId: string;
      requestId: string;
      headers: Headers;
      routeLogger: ReturnType<typeof logger.withContext>;
    }
  | { ok: false; response: NextResponse }
> {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/concierge/monitor",
  });
  if (!userId) {
    routeLogger.warn("Unauthorized concierge monitor request.");
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/concierge/monitor",
    requestId,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many concierge monitor requests. Please retry shortly." },
        { status: 429, headers: rateLimit.headers },
      ),
    };
  }

  const plan = await getUserPlan(userId);
  if (plan !== "concierge") {
    return {
      ok: false,
      response: conciergeForbiddenResponse(),
    };
  }

  return {
    ok: true,
    userId,
    requestId,
    headers: rateLimit.headers,
    routeLogger,
  };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const tripId = url.searchParams.get("tripId")?.trim();
  if (!tripId) {
    return NextResponse.json({ error: "tripId query param is required." }, { status: 422, headers: auth.headers });
  }
  const state = await getProactiveMonitoringState(auth.userId, tripId);
  return NextResponse.json(
    {
      state,
    },
    { headers: auth.headers },
  );
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  const started = await startProactiveMonitoring(auth.userId, parsed.data.tripId, {
    autoRebook: parsed.data.autoRebook,
  });
  if (typeof parsed.data.autoRebook === "boolean") {
    const updated = await setProactiveAutoRebook(auth.userId, parsed.data.tripId, parsed.data.autoRebook);
    return NextResponse.json({ state: updated }, { headers: auth.headers });
  }
  return NextResponse.json({ state: started }, { headers: auth.headers });
}

export async function DELETE(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }
  const stopped = await stopProactiveMonitoring(auth.userId, parsed.data.tripId);
  return NextResponse.json({ state: stopped }, { headers: auth.headers });
}
