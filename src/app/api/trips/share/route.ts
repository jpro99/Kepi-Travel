import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { createShareLink, revokeShareLink } from "@/lib/travelAssistant/tripShareStore";

const ShareOptionsSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
  readOnly: z.boolean().default(true),
  showPersonalNotes: z.boolean().default(false),
});

const PostBodySchema = z.object({
  tripId: z.string().trim().min(1),
  options: ShareOptionsSchema,
});

const DeleteBodySchema = z.object({
  token: z.string().trim().min(1),
});

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
    route: "/api/trips/share",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized trip share request.");
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/trips/share",
    requestId,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many share requests. Please retry shortly." },
        { status: 429, headers: rateLimit.headers },
      ),
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

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    auth.routeLogger.warn("Trip share payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  try {
    const result = await createShareLink(auth.userId, parsed.data.tripId, parsed.data.options);
    if (!result.existing) {
      void trackServerEvent({
        type: "share_link_created",
        userId: auth.userId,
        tripId: parsed.data.tripId,
        readOnly: result.options.readOnly,
        expiresInDays: result.options.expiresInDays,
      });
    }
    const url = new URL(req.url);
    const shareUrl = `${url.origin}/share/${result.token}`;
    return NextResponse.json(
      {
        token: result.token,
        url: shareUrl,
        expiresAt: result.expiresAt,
        options: result.options,
        existing: result.existing,
      },
      { headers: auth.headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create share link.";
    return NextResponse.json(
      { error: message },
      { status: 400, headers: auth.headers },
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return auth.response;
  }

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

  const revoked = await revokeShareLink(parsed.data.token, auth.userId);
  if (!revoked) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404, headers: auth.headers });
  }
  return NextResponse.json({ ok: true }, { headers: auth.headers });
}
