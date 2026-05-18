import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { buildSupportContext } from "@/lib/support/supportContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTPUT_FILTER_PATTERN = /travel\s+insurance/giu;
const PROMPT_FILTER_PATTERN = /\binsurance\b/giu;

const SupportMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

const RequestBodySchema = z.object({
  messages: z.array(SupportMessageSchema).min(1).max(30),
  tripContext: z.string().trim().max(8000).optional(),
});

const SUPPORT_SYSTEM_PROMPT = [
  "You are Kepi Travel Assistant support, a product expert and customer support guide.",
  "You know the app's travel stages, reservations, review queue, disruption recovery, billing plans, notifications, and sharing features.",
  "Answer support questions clearly and concisely with practical steps users can execute in the app.",
  "Escalate to human support when account-level or unresolved technical issues require manual investigation.",
  "Use a friendly, concise, helpful tone.",
  "Never mention travel insurance or any insurance products; this app excludes insurance workflows.",
].join(" ");

function sanitizePromptText(value: string): string {
  return value.replace(PROMPT_FILTER_PATTERN, "[excluded]");
}

function sanitizeModelOutput(value: string): string {
  return value.replace(OUTPUT_FILTER_PATTERN, "coverage planning");
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/support/chat",
  });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "support-chat",
    identifier: userId,
    route: "/api/support/chat",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Support chat rate limit reached. Please retry later." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsed = RequestBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const tripContext = parsed.data.tripContext?.trim() || (await buildSupportContext(userId));
  const promptMessages = parsed.data.messages.map((message) => ({
    role: message.role,
    content: sanitizePromptText(message.content),
  }));

  const encoder = new TextEncoder();
  const responseHeaders = new Headers(rateLimit.headers);
  responseHeaders.set("Content-Type", "text/plain; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (value: string): void => {
        controller.enqueue(encoder.encode(sanitizeModelOutput(value)));
      };

      if (!anthropicApiKey) {
        safeEnqueue(
          "Support AI is temporarily unavailable because ANTHROPIC_API_KEY is not configured. Please use the in-app checklist and try again shortly.",
        );
        controller.close();
        return;
      }

      try {
        const client = new Anthropic({ apiKey: anthropicApiKey });
        const claudeStream = client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 900,
          temperature: 0.2,
          system: `${SUPPORT_SYSTEM_PROMPT}\n\nUser trip context:\n${tripContext}`,
          metadata: { user_id: userId.slice(0, 120) },
          messages: promptMessages,
        });

        let emitted = false;
        for await (const event of claudeStream) {
          if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") {
            continue;
          }
          const chunk = event.delta.text;
          if (!chunk) {
            continue;
          }
          emitted = true;
          safeEnqueue(chunk);
        }

        if (!emitted) {
          safeEnqueue(
            "I can help with trips, reservations, billing, and notifications. Could you share a little more detail?",
          );
        }
      } catch (error) {
        routeLogger.error("Support chat stream failed.", error instanceof Error ? error : undefined);
        safeEnqueue(
          "I could not complete that support response right now. Please try again, or contact a human support specialist.",
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
