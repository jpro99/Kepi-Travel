import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { parseForwardedEmail } from "@/lib/travelAssistant/emailForwardParser";
import { resolveUserIdByForwardAddress } from "@/lib/travelAssistant/emailForwardSetupStore";
import { sendPushNotification } from "@/lib/travelAssistant/pushNotificationService";
import { getActiveTrip, getTrip, updateTrip } from "@/lib/travelAssistant/tripStore";
import { generateId } from "@/lib/utils/generateId";

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

function extractIncomingWebhookSignature(headers: Headers): string {
  return (
    headers.get("x-resend-signature")?.trim() ??
    headers.get("svix-signature")?.trim() ??
    headers.get("x-webhook-signature")?.trim() ??
    ""
  );
}

function verifyResendWebhookSignature(rawBody: string, headers: Headers, requestId: string): boolean {
  const expectedSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  const receivedSignature = extractIncomingWebhookSignature(headers);
  if (!expectedSecret) {
    console.info("[email-forward-webhook] Signature verification skipped (RESEND_WEBHOOK_SECRET not set).", {
      requestId,
      receivedSignature,
    });
    return true;
  }
  console.info("[email-forward-webhook] Signature verification check.", {
    requestId,
    receivedSignature,
  });
  const svixId = headers.get("svix-id")?.trim() ?? "";
  const svixTimestamp = headers.get("svix-timestamp")?.trim() ?? "";
  const svixSignature = headers.get("svix-signature")?.trim() ?? "";
  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("[email-forward-webhook] Missing webhook signature header.", {
      requestId,
      hasSvixId: Boolean(svixId),
      hasSvixTimestamp: Boolean(svixTimestamp),
      hasSvixSignature: Boolean(svixSignature),
      receivedSignature,
    });
    return false;
  }

  const svixHeaders = Object.fromEntries(headers.entries());
  try {
    const webhook = new Webhook(expectedSecret);
    webhook.verify(rawBody, svixHeaders);
    return true;
  } catch (error) {
    console.error("[email-forward-webhook] Signature verification failed.", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
      receivedSignature,
    });
    return false;
  }
}

async function processEmailForwardWebhook(req: Request, requestId: string): Promise<void> {
  const routeLogger = logger.withContext({
    route: "/api/email-forward/receive",
    requestId,
  });
  try {
    const rawBody = await req.text();
    if (!verifyResendWebhookSignature(rawBody, req.headers, requestId)) {
      return;
    }
    let body: unknown = {};
    try {
      body = rawBody.trim().length > 0 ? (JSON.parse(rawBody) as unknown) : {};
    } catch (error) {
      console.error("[email-forward-webhook] Failed to parse JSON body.", {
        requestId,
        error,
        rawBody,
      });
      return;
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      console.error("[email-forward-webhook] Validation failed.", {
        requestId,
        details: parsed.error.flatten(),
        body,
      });
      return;
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
      console.error("[email-forward-webhook] Unable to resolve target user.", {
        requestId,
        authUserId,
        providedUserId,
        addressedUserId,
      });
      return;
    }

    if (authUserId && providedUserId && authUserId !== providedUserId) {
      console.error("[email-forward-webhook] Auth user and provided user mismatch.", {
        requestId,
        authUserId,
        providedUserId,
      });
      return;
    }
    if (authUserId && addressedUserId && authUserId !== addressedUserId) {
      console.error("[email-forward-webhook] Auth user and addressed user mismatch.", {
        requestId,
        authUserId,
        addressedUserId,
      });
      return;
    }
    if (!authUserId && providedUserId && addressedUserId && providedUserId !== addressedUserId) {
      console.error("[email-forward-webhook] Provided user and addressed user mismatch.", {
        requestId,
        providedUserId,
        addressedUserId,
      });
      return;
    }

    const ingestSecret = process.env.EMAIL_FORWARD_INGEST_SECRET?.trim();
    if (!authUserId && ingestSecret) {
      const incomingSecret = req.headers.get("x-email-forward-secret")?.trim() ?? "";
      if (!incomingSecret || incomingSecret !== ingestSecret) {
        console.error("[email-forward-webhook] Ingest secret mismatch.", {
          requestId,
          incomingSecret,
          ingestSecret,
        });
        return;
      }
    }

    const targetTrip = parsed.data.tripId
      ? await getTrip(parsed.data.tripId, targetUserId)
      : await getActiveTrip(targetUserId);
    if (!targetTrip) {
      console.error("[email-forward-webhook] No active trip found for target user.", {
        requestId,
        userId: targetUserId,
        tripId: parsed.data.tripId ?? null,
      });
      return;
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
    const parsedReservation = {
      id: `res-email-${generateId()}`,
      type: parserResult.draft.type,
      title: parserResult.draft.title,
      provider: parserResult.draft.provider,
      localTime: parserResult.draft.localTime,
      timezone: parserResult.draft.timezone || "Etc/UTC",
      location: parserResult.draft.location,
      confirmationCode: parserResult.draft.confirmationCode,
      assignedTo: parserResult.draft.assignedTo.length > 0 ? parserResult.draft.assignedTo : defaultAssignees,
      stage: targetTrip.stage,
      critical:
        parserResult.draft.type === "flight" ||
        parserResult.draft.type === "train" ||
        parserResult.draft.type === "ride",
      confidence: confidenceToDraftValue(parserResult.confidenceScore),
      notes: parserResult.draft.notes,
      source: "imported" as const,
    };
    const hasMatchingReservation = targetTrip.reservations.some((reservation) => {
      return (
        reservation.type === parsedReservation.type &&
        reservation.title === parsedReservation.title &&
        reservation.provider === parsedReservation.provider &&
        reservation.localTime === parsedReservation.localTime &&
        reservation.confirmationCode === parsedReservation.confirmationCode
      );
    });
    const nextReservations = hasMatchingReservation
      ? targetTrip.reservations
      : [parsedReservation, ...targetTrip.reservations];
    const sourceSubject = parsed.data.subject?.trim() || "Forwarded email";
    const reviewItem = {
      id: `review-email-${generateId()}`,
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
    const updated = await updateTrip(
      targetTrip.id,
      {
        reservations: nextReservations,
        reviewQueue: nextQueue,
      },
      targetUserId,
    );
    if (!updated) {
      console.error("[email-forward-webhook] Trip update failed.", {
        requestId,
        tripId: targetTrip.id,
        userId: targetUserId,
      });
      return;
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
  } catch (error) {
    console.error("[email-forward-webhook] Unhandled processing error.", {
      requestId,
      error,
    });
  }
}

export async function POST(req: Request) {
  const immediateResponse = NextResponse.json({
    ok: true,
    accepted: true,
    message: "Email forward webhook accepted",
  });
  try {
    const requestId = req.headers.get("x-request-id")?.trim() || generateId();
    const requestClone = req.clone();
    queueMicrotask(() => {
      void processEmailForwardWebhook(requestClone, requestId).catch((error) => {
        console.error("[email-forward-webhook] Background processor failed.", {
          requestId,
          error,
        });
      });
    });
  } catch (error) {
    console.error("[email-forward-webhook] Failed to queue background processing.", {
      error,
    });
  }
  return immediateResponse;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Email forward webhook is running",
  });
}
