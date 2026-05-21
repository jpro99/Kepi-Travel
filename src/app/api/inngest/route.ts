import { randomUUID } from "node:crypto";
import { serve } from "inngest/next";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { reminderLadder } from "@/inngest/functions/reminderLadder";
import { emailScheduler } from "@/inngest/functions/emailScheduler";
import { proactiveMonitoringSweep } from "@/inngest/functions/proactiveMonitoringSweep";
import { travelUpdatePass } from "@/inngest/functions/travelUpdatePass";
import { trialExpirySweep } from "@/inngest/functions/trialExpirySweep";
import { inngest } from "@/inngest/client";

const handlers = serve({
  client: inngest,
  functions: [travelUpdatePass, reminderLadder, emailScheduler, proactiveMonitoringSweep, trialExpirySweep],
});

export const GET = async (request: NextRequest, context: unknown): Promise<Response> => {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  logger.withContext({ requestId, route: "/api/inngest", method: "GET" }).info("Handling Inngest GET request.");
  return handlers.GET(request, context as never);
};

export const POST = async (request: NextRequest, context: unknown): Promise<Response> => {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  logger.withContext({ requestId, route: "/api/inngest", method: "POST" }).info("Handling Inngest POST request.");
  return handlers.POST(request, context as never);
};

export const PUT = async (request: NextRequest, context: unknown): Promise<Response> => {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  logger.withContext({ requestId, route: "/api/inngest", method: "PUT" }).info("Handling Inngest PUT request.");
  return handlers.PUT(request, context as never);
};
