import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { handleConfirmationScanUpload } from "@/lib/travelAssistant/confirmationScanHandler";
import { enforceRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils/generateId";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  try {
    const userId = await resolveAuthenticatedUserId();
    const routeLogger = logger.withContext({
      requestId,
      userId,
      route: "/api/travel-updates/ticket-scan",
    });

    if (!userId) {
      routeLogger.warn("Unauthorized ticket scan request.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await enforceRateLimit({
      policyName: "travel-updates-general",
      identifier: userId,
      route: "/api/travel-updates/ticket-scan",
      requestId,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please retry shortly." },
        { status: 429, headers: rateLimit.headers },
      );
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

    routeLogger.info("Confirmation scan request started.");
    const response = await handleConfirmationScanUpload(req, {
      anthropicApiKey,
      rateLimitHeaders: Object.fromEntries(rateLimit.headers.entries()),
    });
    if (response.ok) {
      routeLogger.info("Confirmation scan request completed.");
    } else {
      routeLogger.warn("Confirmation scan request failed.", { status: response.status });
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirmation scan failed.";
    logger.error("Ticket scan route crashed.", { requestId, error: message });
    return NextResponse.json({ error: `Confirmation scan failed: ${message}` }, { status: 500 });
  }
}
