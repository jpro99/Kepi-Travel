import "server-only";

import { createElement } from "react";
import { render } from "@react-email/render";
import { NextResponse } from "next/server";
import { z } from "zod";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { TripShareEmail } from "@/lib/email/templates/tripShareEmail";
import { getResendClient, getResendFromEmail } from "@/lib/email/resendClient";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { createShareLink } from "@/lib/travelAssistant/tripShareStore";
import { getTrip } from "@/lib/travelAssistant/tripStore";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";

const ShareOptionsSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
  readOnly: z.boolean().default(true),
  showPersonalNotes: z.boolean().default(false),
});

const BodySchema = z.object({
  tripId: z.string().trim().min(1),
  email: z.string().trim().email(),
  options: ShareOptionsSchema,
  senderName: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/trips/share/send-email",
  });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/trips/share/send-email",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many share requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  const trip = await getTrip(parsed.data.tripId, userId);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404, headers: rateLimit.headers });
  }

  try {
    const result = await createShareLink(
      userId,
      parsed.data.tripId,
      parsed.data.options,
      parsed.data.email,
    );

    if (!result.existing) {
      void trackServerEvent({
        type: "share_link_created",
        userId,
        tripId: parsed.data.tripId,
        readOnly: result.options.readOnly,
        expiresInDays: result.options.expiresInDays,
      });
    }

    const url = new URL(req.url);
    const shareUrl = `${url.origin}/share/${result.token}`;

    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json(
        {
          error: "Email is not configured on this server. Copy the link instead.",
          token: result.token,
          url: shareUrl,
          expiresAt: result.expiresAt,
        },
        { status: 503, headers: rateLimit.headers },
      );
    }

    let html: string;
    try {
      html = await render(
        createElement(TripShareEmail, {
          recipientEmail: parsed.data.email,
          tripName: trip.name,
          destination: trip.destination,
          shareUrl,
          senderName: parsed.data.senderName,
          expiresAt: result.expiresAt,
        }),
      );
    } catch (error) {
      routeLogger.warn("Trip share email render failed.", {
        error: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.json(
        { error: "Could not render invite email." },
        { status: 500, headers: rateLimit.headers },
      );
    }

    const { error: sendError } = await resend.emails.send({
      from: getResendFromEmail(),
      to: parsed.data.email,
      subject: `You're invited to view ${trip.name} on Kepi Travel`,
      html,
    });

    if (sendError) {
      routeLogger.warn("Trip share email send failed.", { message: sendError.message });
      return NextResponse.json(
        { error: `Email failed: ${sendError.message}` },
        { status: 502, headers: rateLimit.headers },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        emailSent: true,
        token: result.token,
        url: shareUrl,
        expiresAt: result.expiresAt,
        intendedEmail: parsed.data.email.toLowerCase(),
        existing: result.existing,
      },
      { headers: rateLimit.headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send trip invite.";
    return NextResponse.json({ error: message }, { status: 400, headers: rateLimit.headers });
  }
}
