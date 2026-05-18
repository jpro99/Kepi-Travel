import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  generateDisruptionRecoveryPlan,
  generateLayoverSuggestions,
  generatePackingReminders,
  generateTripBriefing,
} from "@/lib/travelAssistant/aiSuggestionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SuggestionTypeSchema = z.enum(["layover", "disruption", "packing", "briefing"]);

const ReservationContextSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  type: z.string().min(1).max(48),
  title: z.string().min(1).max(200),
  provider: z.string().min(1).max(120).optional(),
  localTime: z.string().min(1).max(80).optional(),
  timezone: z.string().min(1).max(80).optional(),
  location: z.string().min(1).max(200).optional(),
  confirmationCode: z.string().min(1).max(80).optional(),
  notes: z.string().min(1).max(1500).optional(),
});

const LayoverContextSchema = z.object({
  airport: z.string().trim().min(3).max(16).default("airport"),
  layoverMinutes: z.number().int().min(30).max(24 * 60).default(120),
});

const DisruptionContextSchema = z.object({
  scenario: z.string().trim().min(1).max(80),
  severity: z.string().trim().min(1).max(32).optional(),
  summary: z.string().trim().min(1).max(1000).optional(),
  location: z.string().trim().min(1).max(120).optional(),
  impactedReservations: z.array(ReservationContextSchema).max(12).default([]),
  latestUpdates: z
    .array(
      z.object({
        provider: z.string().trim().min(1).max(80).optional(),
        summary: z.string().trim().min(1).max(400),
        severity: z.string().trim().min(1).max(32).optional(),
      }),
    )
    .max(12)
    .default([]),
});

const ReservationListContextSchema = z.object({
  reservations: z.array(ReservationContextSchema).max(40).default([]),
});

const RequestBodySchema = z.object({
  type: SuggestionTypeSchema,
  context: z.unknown().default({}),
});

function jsonError(message: string, status: number, headers?: Headers): NextResponse {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/ai/suggestions",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized AI suggestions request.");
    return jsonError("Unauthorized", 401);
  }

  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: userId,
    route: "/api/ai/suggestions",
    requestId,
  });
  if (!rateLimit.allowed) {
    return jsonError("Too many AI suggestion requests. Please retry later.", 429, rateLimit.headers);
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsedBody = RequestBodySchema.safeParse(payload);
  if (!parsedBody.success) {
    routeLogger.warn("AI suggestions payload validation failed.", {
      issues: parsedBody.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsedBody.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  let suggestionStream: AsyncGenerator<string>;
  switch (parsedBody.data.type) {
    case "layover": {
      const parsedContext = LayoverContextSchema.safeParse(parsedBody.data.context);
      if (!parsedContext.success) {
        return NextResponse.json(
          { error: "Invalid layover context", details: parsedContext.error.flatten() },
          { status: 422, headers: rateLimit.headers },
        );
      }
      suggestionStream = generateLayoverSuggestions(
        userId,
        parsedContext.data.airport,
        parsedContext.data.layoverMinutes,
      );
      break;
    }
    case "disruption": {
      const parsedContext = DisruptionContextSchema.safeParse(parsedBody.data.context);
      if (!parsedContext.success) {
        return NextResponse.json(
          { error: "Invalid disruption context", details: parsedContext.error.flatten() },
          { status: 422, headers: rateLimit.headers },
        );
      }
      suggestionStream = generateDisruptionRecoveryPlan(userId, parsedContext.data);
      break;
    }
    case "packing": {
      const parsedContext = ReservationListContextSchema.safeParse(parsedBody.data.context);
      if (!parsedContext.success) {
        return NextResponse.json(
          { error: "Invalid packing context", details: parsedContext.error.flatten() },
          { status: 422, headers: rateLimit.headers },
        );
      }
      suggestionStream = generatePackingReminders(userId, parsedContext.data.reservations);
      break;
    }
    case "briefing": {
      const parsedContext = ReservationListContextSchema.safeParse(parsedBody.data.context);
      if (!parsedContext.success) {
        return NextResponse.json(
          { error: "Invalid briefing context", details: parsedContext.error.flatten() },
          { status: 422, headers: rateLimit.headers },
        );
      }
      suggestionStream = generateTripBriefing(userId, parsedContext.data.reservations);
      break;
    }
    default: {
      return NextResponse.json({ error: "Unsupported AI suggestion type." }, { status: 422, headers: rateLimit.headers });
    }
  }

  routeLogger.info("AI suggestion stream started.", {
    suggestionType: parsedBody.data.type,
  });

  const encoder = new TextEncoder();
  const responseHeaders = new Headers(rateLimit.headers);
  responseHeaders.set("Content-Type", "text/plain; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of suggestionStream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        routeLogger.error("AI suggestion stream failed during response generation.", {
          error,
        });
        controller.enqueue(
          encoder.encode("AI suggestions are temporarily unavailable. Use your existing trip checklist and retry shortly."),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: responseHeaders,
  });
}
