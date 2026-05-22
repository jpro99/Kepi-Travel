import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { parseForwardedEmail } from "@/lib/travelAssistant/emailForwardParser";
import { resolveUserIdByForwardAddress } from "@/lib/travelAssistant/emailForwardSetupStore";
import { sendPushNotification } from "@/lib/travelAssistant/pushNotificationService";
import { getActiveTrip, getTrip, updateTrip } from "@/lib/travelAssistant/tripStore";

const AttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255).optional(),
  contentType: z.string().trim().min(1).max(120).optional(),
});

const BodySchema = z.object({
  userId: z.string().trim().min(1).optional(),
  tripId: z.string().trim().min(1).optional(),
  from: z.string().trim().max(240).optional(),
  to: z.string().trim().max(240).optional(),
  subject: z.string().trim().max(300).optional(),
  text: z.string().max(200_000).optional(),
  html: z.string().max(800_000).optional(),
  attachments: z.array(AttachmentSchema).default([]),
});

function confidenceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function confidenceToDraftValue(score: number): "high" | "medium" | "low" {
  return confidenceLabel(score);
}

function buildPushBody(score: number): string {
  const level = confidenceLabel(score);
  if (level === "high") {
    return "New reservation found — tap to review";
  }
  if (level === "medium") {
    return "New reservation needs a quick check — one field is missing";
  }
  return "We need your help reading a forwarded email";
}

function extractRecipientCandidates(toValue?: string): string[] {
  if (!toValue || toValue.trim().length === 0) {
    return [];
  }
  return toValue
    .split(/[;,]/u)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const routeLogger = logger.withContext({
    route: "/api/email-forward/receive",
    requestId,
  });

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten(),
      },
      { status: 422 },
    );
  }

  const authUserId = await resolveAuthenticatedUserId();
  const providedUserId = parsed.data.userId?.trim() || null;
  let addressedUserId: string | null = null;
  for (const candidateAddress of extractRecipientCandidates(parsed.data.to)) {
    const resolved = await resolveUserIdByForwardAddress(candidateAddress);
    if (resolved) {
      addressedUserId = resolved;
      break;
    }
  }
  const targetUserId = authUserId ?? providedUserId ?? addressedUserId;
  if (!targetUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authUserId && providedUserId && authUserId !== providedUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (authUserId && addressedUserId && authUserId !== addressedUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!authUserId && providedUserId && addressedUserId && providedUserId !== addressedUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ingestSecret = process.env.EMAIL_FORWARD_INGEST_SECRET?.trim();
  if (!authUserId && ingestSecret) {
    const incomingSecret = req.headers.get("x-email-forward-secret")?.trim() ?? "";
    if (!incomingSecret || incomingSecret !== ingestSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const targetTrip = parsed.data.tripId
    ? await getTrip(parsed.data.tripId, targetUserId)
    : await getActiveTrip(targetUserId);
  if (!targetTrip) {
    return NextResponse.json(
      { error: "No active trip found for this user. Create a trip first, then retry forwarding." },
      { status: 404 },
    );
  }

  const parserResult = await parseForwardedEmail({
    subject: parsed.data.subject,
    from: parsed.data.from,
    text: parsed.data.text,
    html: parsed.data.html,
    attachments: parsed.data.attachments,
  });

  const defaultAssignees = Array.from(
    new Set(targetTrip.reservations.flatMap((reservation) => reservation.assignedTo)),
  );
  const sourceSubject = parsed.data.subject?.trim() || "Forwarded email";
  const reviewItem = {
    id: `review-email-${randomUUID()}`,
    reasons:
      parserResult.parserNotes.length > 0
        ? parserResult.parserNotes
        : ["Forwarded email parsed and queued for confirmation."],
    impact:
      parserResult.parsingStatus === "needs-user-input"
        ? "We need your help with this one"
        : parserResult.parsingStatus === "needs-review"
          ? "A few fields need review before publish."
          : "Ready for quick confirmation.",
    sourceEmailSubject: sourceSubject,
    draft: {
      type: parserResult.draft.type,
      title: parserResult.draft.title,
      provider: parserResult.draft.provider,
      localTime: parserResult.draft.localTime,
      timezone: parserResult.draft.timezone || "Etc/UTC",
      location: parserResult.draft.location,
      confirmationCode: parserResult.draft.confirmationCode,
      assignedTo: defaultAssignees,
      stage: targetTrip.stage,
      critical:
        parserResult.draft.type === "flight" ||
        parserResult.draft.type === "train" ||
        parserResult.draft.type === "ride",
      confidence: confidenceToDraftValue(parserResult.confidenceScore),
      notes: parserResult.draft.notes,
    },
    sourceChannel: "email-forward",
    parseConfidenceScore: parserResult.confidenceScore,
    parsingStatus: parserResult.parsingStatus,
    missingFields: parserResult.missingFields,
    originalEmailText: parserResult.originalEmailText,
    hasPdfAttachment: parserResult.hasPdfAttachment,
    imageBasedEmail: parserResult.imageBasedEmail,
    reviewStatus: parserResult.parsingStatus === "needs-user-input" ? "incomplete" : "pending",
    parserNotes: parserResult.parserNotes,
  };

  const nextQueue = [reviewItem, ...(targetTrip.reviewQueue ?? [])];
  const updated = await updateTrip(targetTrip.id, { reviewQueue: nextQueue }, targetUserId);
  if (!updated) {
    return NextResponse.json({ error: "Trip update failed" }, { status: 500 });
  }

  const notificationSent = await sendPushNotification(targetUserId, {
    title: "Forwarded reservation received",
    body: buildPushBody(parserResult.confidenceScore),
    url: `/travel-assistant?tripId=${encodeURIComponent(targetTrip.id)}`,
  });

  routeLogger.info("Forwarded email parsed into review queue.", {
    userId: targetUserId,
    tripId: targetTrip.id,
    score: parserResult.confidenceScore,
    status: parserResult.parsingStatus,
    usedAiFallback: parserResult.usedAiFallback,
    notificationSent,
  });

  return NextResponse.json({
    ok: true,
    tripId: targetTrip.id,
    reviewItem,
    parser: {
      confidenceScore: parserResult.confidenceScore,
      parsingStatus: parserResult.parsingStatus,
      missingFields: parserResult.missingFields,
      usedAiFallback: parserResult.usedAiFallback,
      imageBasedEmail: parserResult.imageBasedEmail,
      hasPdfAttachment: parserResult.hasPdfAttachment,
    },
  });
}
