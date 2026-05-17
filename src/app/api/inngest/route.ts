import { randomUUID } from "node:crypto";
import { serve } from "inngest/next";
import { logger } from "@/lib/logger";
import { reminderLadder } from "@/inngest/functions/reminderLadder";
import { travelUpdatePass } from "@/inngest/functions/travelUpdatePass";
import { inngest } from "@/inngest/client";

const handlers = serve({
  client: inngest,
  functions: [travelUpdatePass, reminderLadder],
});

export const GET = async (request: Request, ...args: unknown[]): Promise<Response> => {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  logger.withContext({ requestId, route: "/api/inngest", method: "GET" }).info("Handling Inngest GET request.");
  return handlers.GET(request, ...(args as []));
};

export const POST = async (request: Request, ...args: unknown[]): Promise<Response> => {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  logger.withContext({ requestId, route: "/api/inngest", method: "POST" }).info("Handling Inngest POST request.");
  return handlers.POST(request, ...(args as []));
};

export const PUT = async (request: Request, ...args: unknown[]): Promise<Response> => {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  logger.withContext({ requestId, route: "/api/inngest", method: "PUT" }).info("Handling Inngest PUT request.");
  return handlers.PUT(request, ...(args as []));
};
