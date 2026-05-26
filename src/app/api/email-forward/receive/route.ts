import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { getResendClient } from "@/lib/email/resendClient";
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

type ParsedAttachment = z.infer<typeof AttachmentSchema>;

const BodySchema = z.object({
  userId: z.string().trim().min(1).optional(),
  tripId: z.string().trim().min(1).optional(),
  eventType: z.string().trim().min(1).max(120).optional(),
  emailId: z.string().trim().min(1).max(160).optional(),
  from: z.string().trim().max(240).optional(),
  to: z.unknown().optional(),
  cc: z.unknown().optional(),
  envelope: z.unknown().optional(),
  subject: z.string().trim().max(300).optional(),
  text: z.string().max(200_000).optional(),
  html: z.string().max(800_000).optional(),
  attachments: z.array(AttachmentSchema).default([]),
});

interface EmailForwardProcessResult {
  ok: boolean;
  status: number;
  message: string;
  userId?: string;
  tripId?: string;
}

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

function normalizeDuplicateValue(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (typeof value !== "undefined" && value !== null) {
      return value;
    }
  }
  return undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function normalizeAttachmentMetadata(rawAttachments: unknown): ParsedAttachment[] {
  if (!Array.isArray(rawAttachments)) {
    return [];
  }
  return rawAttachments.flatMap((rawAttachment) => {
    const attachment = asRecord(rawAttachment);
    if (!attachment) {
      return [];
    }
    const filename = firstNonEmptyString(attachment.filename);
    const contentType = firstNonEmptyString(attachment.contentType, attachment.content_type);
    if (!filename && !contentType) {
      return [];
    }
    return [
      {
        filename,
        contentType,
      },
    ];
  });
}

function normalizeIncomingWebhookBody(body: unknown): Record<string, unknown> {
  const root = asRecord(body) ?? {};
  const data = asRecord(root.data);
  const nestedEmail = asRecord(data?.email);

  const normalized: Record<string, unknown> = {};
  normalized.userId = firstNonEmptyString(root.userId, data?.userId, nestedEmail?.userId);
  normalized.tripId = firstNonEmptyString(root.tripId, data?.tripId, nestedEmail?.tripId);
  normalized.eventType = firstNonEmptyString(root.type, data?.type);
  normalized.emailId = firstNonEmptyString(
    root.emailId,
    root.email_id,
    data?.emailId,
    data?.email_id,
    nestedEmail?.emailId,
    nestedEmail?.email_id,
    nestedEmail?.id,
  );
  normalized.from = firstNonEmptyString(root.from, data?.from, nestedEmail?.from);
  normalized.to = firstDefined(root.to, data?.to, nestedEmail?.to);
  normalized.cc = firstDefined(root.cc, data?.cc, nestedEmail?.cc);
  normalized.envelope = firstDefined(root.envelope, data?.envelope, nestedEmail?.envelope);
  normalized.subject = firstNonEmptyString(root.subject, data?.subject, nestedEmail?.subject);
  normalized.text = firstNonEmptyString(
    root.text,
    data?.text,
    nestedEmail?.text,
    root.bodyText,
    data?.bodyText,
    nestedEmail?.bodyText,
    root.plainText,
    data?.plainText,
    nestedEmail?.plainText,
  );
  normalized.html = firstNonEmptyString(
    root.html,
    data?.html,
    nestedEmail?.html,
    root.bodyHtml,
    data?.bodyHtml,
    nestedEmail?.bodyHtml,
  );
  normalized.attachments = normalizeAttachmentMetadata(
    firstDefined(root.attachments, data?.attachments, nestedEmail?.attachments),
  );
  return normalized;
}

function isDuplicateReservation(
  existing: {
    type?: string;
    provider?: string;
    localTime?: string;
    location?: string;
    confirmationCode?: string;
    flightNumber?: string;
  },
  candidate: {
    type?: string;
    provider?: string;
    localTime?: string;
    location?: string;
    confirmationCode?: string;
    flightNumber?: string;
  },
): boolean {
  const existingCode = normalizeDuplicateValue(existing.confirmationCode);
  const candidateCode = normalizeDuplicateValue(candidate.confirmationCode);
  const existingFlight = normalizeDuplicateValue(existing.flightNumber);
  const candidateFlight = normalizeDuplicateValue(candidate.flightNumber);

  // For flights: same confirmation code is NOT enough — multi-leg itineraries
  // share one booking reference but are different flights. Require flight number
  // to also match, or fall back to departure time if flight number is missing.
  const existingType = normalizeDuplicateValue(existing.type);
  const candidateType = normalizeDuplicateValue(candidate.type);
  if (existingCode.length > 0 && candidateCode.length > 0 && existingCode === candidateCode) {
    if (existingType === "flight" || candidateType === "flight") {
      // Both have flight numbers — they must match to be a duplicate
      if (existingFlight.length > 0 && candidateFlight.length > 0) {
        return existingFlight === candidateFlight;
      }
      // No flight numbers — fall back to departure time match
      const existingTime = normalizeDuplicateValue(existing.localTime);
      const candidateTime = normalizeDuplicateValue(candidate.localTime);
      if (existingTime.length > 0 && candidateTime.length > 0) {
        return existingTime === candidateTime;
      }
      // Can't distinguish — treat as duplicate to be safe
      return true;
    }
    // Non-flight: confirmation code match is a duplicate
    return true;
  }
  if (existingType !== candidateType) {
    return false;
  }
  const existingLocalTime = normalizeDuplicateValue(existing.localTime);
  const candidateLocalTime = normalizeDuplicateValue(candidate.localTime);
  // For hotels: match on check-in date (first 10 chars) + location
  // Never match on provider since it's often "Gmail" or similar
  if (existingType === "hotel") {
    const existingDate = existingLocalTime.slice(0, 10);
    const candidateDate = candidateLocalTime.slice(0, 10);
    const existingLocation = normalizeDuplicateValue(existing.location);
    const candidateLocation = normalizeDuplicateValue(candidate.location);
    if (existingDate.length === 10 && candidateDate.length === 10 && existingDate === candidateDate &&
        existingLocation.length > 0 && candidateLocation.length > 0 && existingLocation === candidateLocation) {
      return true;
    }
    return false;
  }
  const existingProvider = normalizeDuplicateValue(existing.provider);
  const candidateProvider = normalizeDuplicateValue(candidate.provider);
  const existingLocation = normalizeDuplicateValue(existing.location);
  const candidateLocation = normalizeDuplicateValue(candidate.location);
  const hasFullCompositeSignal =
    existingType.length > 0 &&
    candidateType.length > 0 &&
    existingProvider.length > 0 &&
    candidateProvider.length > 0 &&
    existingLocalTime.length > 0 &&
    candidateLocalTime.length > 0 &&
    existingLocation.length > 0 &&
    candidateLocation.length > 0;
  if (!hasFullCompositeSignal) {
    return false;
  }
  return (
    existingType === candidateType &&
    existingProvider === candidateProvider &&
    existingLocalTime === candidateLocalTime &&
    existingLocation === candidateLocation
  );
}

function isDuplicateAgainstReviewQueue(
  reviewQueue: unknown,
  candidate: {
    type?: string;
    provider?: string;
    localTime?: string;
    location?: string;
    confirmationCode?: string;
    flightNumber?: string;
  },
): boolean {
  if (!Array.isArray(reviewQueue)) {
    return false;
  }
  return reviewQueue.some((item) => {
    const reviewItem = asRecord(item);
    const draft = asRecord(reviewItem?.draft);
    if (!draft) {
      return false;
    }
    return isDuplicateReservation(
      {
        type: typeof draft.type === "string" ? draft.type : "",
        provider: typeof draft.provider === "string" ? draft.provider : "",
        localTime: typeof draft.localTime === "string" ? draft.localTime : "",
        location: typeof draft.location === "string" ? draft.location : "",
        confirmationCode: typeof draft.confirmationCode === "string" ? draft.confirmationCode : "",
        flightNumber: typeof draft.flightNumber === "string" ? draft.flightNumber : "",
      },
      candidate,
    );
  });
}

function extractRecipientCandidates(toValue: unknown): string[] {
  if (typeof toValue === "undefined" || toValue === null) {
    return [];
  }
  if (typeof toValue === "string") {
    const emailMatches = toValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu);
    if (emailMatches && emailMatches.length > 0) {
      return emailMatches.map((candidate) => candidate.trim().toLowerCase());
    }
    return toValue
      .split(/[;,]/u)
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0);
  }
  if (Array.isArray(toValue)) {
    return toValue.flatMap((entry) => extractRecipientCandidates(entry));
  }
  if (typeof toValue === "object") {
    const candidate = toValue as Record<string, unknown>;
    return [
      "email",
      "address",
      "mail",
      "text",
      "value",
      "raw",
      "to",
      "cc",
      "envelope",
      "recipient",
      "recipients",
      "deliveredTo",
      "delivered_to",
      "originalTo",
      "original_to",
      "xOriginalTo",
      "x_original_to",
      "rcptTo",
      "rcpt_to",
    ].flatMap((key) =>
      extractRecipientCandidates(candidate[key]),
    );
  }
  return [];
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

async function processEmailForwardWebhook(req: Request, requestId: string): Promise<EmailForwardProcessResult> {
  const routeLogger = logger.withContext({
    route: "/api/email-forward/receive",
    requestId,
  });
  try {
    const rawBody = await req.text();
    if (!verifyResendWebhookSignature(rawBody, req.headers, requestId)) {
      return { ok: false, status: 401, message: "Invalid webhook signature." };
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
      return { ok: false, status: 400, message: "Invalid JSON body." };
    }

    const rawPayload = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const rawPayloadNestedData =
      rawPayload?.data && typeof rawPayload.data === "object"
        ? (rawPayload.data as Record<string, unknown>)
        : null;
    const normalizedBody = normalizeIncomingWebhookBody(body);
    routeLogger.info("Incoming webhook recipient payload fields.", {
      rawTo: rawPayload?.to ?? null,
      rawCc: rawPayload?.cc ?? null,
      rawEnvelope: rawPayload?.envelope ?? null,
      rawDataTo: rawPayloadNestedData?.to ?? null,
      rawDataCc: rawPayloadNestedData?.cc ?? null,
      rawDataEnvelope: rawPayloadNestedData?.envelope ?? null,
      rawDataFrom: rawPayloadNestedData?.from ?? null,
      rawDataSubject: rawPayloadNestedData?.subject ?? null,
      rawDataEmailId: rawPayloadNestedData?.email_id ?? null,
      normalizedSubject: normalizedBody.subject ?? null,
      normalizedFrom: normalizedBody.from ?? null,
      normalizedEmailId: normalizedBody.emailId ?? null,
    });

    const parsed = BodySchema.safeParse(normalizedBody);
    if (!parsed.success) {
      console.error("[email-forward-webhook] Validation failed.", {
        requestId,
        details: parsed.error.flatten(),
        body: normalizedBody,
      });
      return { ok: false, status: 422, message: "Webhook body validation failed." };
    }

    const authUserId = await resolveAuthenticatedUserId();
    const providedUserId = parsed.data.userId?.trim() || null;
    let addressedUserId: string | null = null;
    const recipientCandidates = Array.from(
      new Set([
        ...extractRecipientCandidates(parsed.data.to),
        ...extractRecipientCandidates(parsed.data.cc),
        ...extractRecipientCandidates(parsed.data.envelope),
        ...extractRecipientCandidates(rawPayload?.to),
        ...extractRecipientCandidates(rawPayload?.cc),
        ...extractRecipientCandidates(rawPayload?.envelope),
        ...extractRecipientCandidates(rawPayloadNestedData?.to),
        ...extractRecipientCandidates(rawPayloadNestedData?.cc),
        ...extractRecipientCandidates(rawPayloadNestedData?.envelope),
      ]),
    );
    routeLogger.info("Email forward recipient candidates extracted.", {
      parsedTo: parsed.data.to ?? null,
      parsedCc: parsed.data.cc ?? null,
      parsedEnvelope: parsed.data.envelope ?? null,
      recipientCandidates,
    });
    for (const candidateAddress of recipientCandidates) {
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
        recipientCandidates,
      });
      return { ok: false, status: 404, message: "Unable to resolve target user." };
    }

    if (authUserId && providedUserId && authUserId !== providedUserId) {
      console.error("[email-forward-webhook] Auth user and provided user mismatch.", {
        requestId,
        authUserId,
        providedUserId,
      });
      return { ok: false, status: 403, message: "Auth user and provided user mismatch." };
    }
    if (authUserId && addressedUserId && authUserId !== addressedUserId) {
      console.error("[email-forward-webhook] Auth user and addressed user mismatch.", {
        requestId,
        authUserId,
        addressedUserId,
      });
      return { ok: false, status: 403, message: "Auth user and addressed user mismatch." };
    }
    if (!authUserId && providedUserId && addressedUserId && providedUserId !== addressedUserId) {
      console.error("[email-forward-webhook] Provided user and addressed user mismatch.", {
        requestId,
        providedUserId,
        addressedUserId,
      });
      return { ok: false, status: 403, message: "Provided user and addressed user mismatch." };
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
        return { ok: false, status: 401, message: "Email forward ingest secret mismatch." };
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
      return { ok: false, status: 404, message: "No active trip found for target user.", userId: targetUserId };
    }

    let parserSubject = parsed.data.subject ?? "";
    let parserFrom = parsed.data.from ?? "";
    let parserText = parsed.data.text ?? "";
    let parserHtml = parsed.data.html ?? "";
    let parserAttachments = parsed.data.attachments;
    const emailId = parsed.data.emailId?.trim() ?? "";
    if (emailId && parserText.trim().length === 0 && parserHtml.trim().length === 0) {
      const resendClient = getResendClient();
      if (!resendClient) {
        routeLogger.warn("Resend receiving lookup skipped because RESEND_API_KEY is missing.", {
          emailId,
        });
      } else {
        try {
          const receivedEmailResponse = await resendClient.emails.receiving.get(emailId);
          if (receivedEmailResponse.error || !receivedEmailResponse.data) {
            routeLogger.error("Resend receiving lookup failed.", {
              emailId,
              error: receivedEmailResponse.error?.message ?? "unknown",
            });
          } else {
            const receivedEmail = receivedEmailResponse.data;
            parserSubject = parserSubject.trim() || receivedEmail.subject?.trim() || "";
            parserFrom = parserFrom.trim() || receivedEmail.from?.trim() || "";
            parserText = parserText.trim() || receivedEmail.text || "";
            parserHtml = parserHtml.trim() || receivedEmail.html || "";
            if (parserAttachments.length === 0) {
              parserAttachments = normalizeAttachmentMetadata(receivedEmail.attachments);
            }
            routeLogger.info("Hydrated received email body from Resend API.", {
              emailId,
              parserTextLength: parserText.length,
              parserHtmlLength: parserHtml.length,
              parserSubjectLength: parserSubject.length,
              parserFromLength: parserFrom.length,
            });
          }
        } catch (error) {
          routeLogger.error("Resend receiving lookup threw an exception.", {
            emailId,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    }

    const parserResult = await parseForwardedEmail({
      subject: parserSubject,
      from: parserFrom,
      text: parserText,
      html: parserHtml,
      attachments: parserAttachments,
    });
    const parserDraftRecordCandidates = Array.isArray((parserResult as { drafts?: unknown }).drafts)
      ? (parserResult as { drafts?: unknown }).drafts
      : [];
    const parserDraftRecords = (
      parserDraftRecordCandidates.length > 0 ? parserDraftRecordCandidates : [parserResult?.draft ?? {}]
    ).flatMap((candidate) =>
      candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? [(candidate as Record<string, unknown>)]
        : [],
    );
    const parserNotes = Array.isArray(parserResult?.parserNotes)
      ? parserResult.parserNotes.filter((note): note is string => typeof note === "string" && note.trim().length > 0)
      : [];
    const parserMissingFields = Array.isArray(parserResult?.missingFields)
      ? parserResult.missingFields.filter((field): field is string => typeof field === "string")
      : [];
    const parserConfidenceScore = Number.isFinite(parserResult?.confidenceScore) ? parserResult.confidenceScore : 0;
    const parserParsingStatus =
      parserResult?.parsingStatus === "auto-parsed" ||
      parserResult?.parsingStatus === "needs-review" ||
      parserResult?.parsingStatus === "needs-user-input"
        ? parserResult.parsingStatus
        : "needs-review";
    const parserOriginalEmailText =
      typeof parserResult?.originalEmailText === "string" ? parserResult.originalEmailText : "";
    const parserHasPdfAttachment = Boolean(parserResult?.hasPdfAttachment);
    const parserImageBasedEmail = Boolean(parserResult?.imageBasedEmail);
    const parserUsedAiFallback = Boolean(parserResult?.usedAiFallback);

    const defaultAssignees = Array.from(
      new Set(targetTrip.reservations.flatMap((reservation) => reservation.assignedTo)),
    );
    let nextReservations = [...targetTrip.reservations];
    let nextQueue = [...(targetTrip.reviewQueue ?? [])];
    let acceptedDraftCount = 0;
    let duplicateDraftCount = 0;
    for (const parserDraftRecord of parserDraftRecords) {
      const parserType =
        parserDraftRecord.type === "flight" ||
        parserDraftRecord.type === "hotel" ||
        parserDraftRecord.type === "train" ||
        parserDraftRecord.type === "ride"
          ? parserDraftRecord.type
          : "ride";
      const parserTitle = typeof parserDraftRecord.title === "string" ? parserDraftRecord.title : "";
      const parserProvider = typeof parserDraftRecord.provider === "string" ? parserDraftRecord.provider : "";
      const parserLocalTime = typeof parserDraftRecord.localTime === "string" ? parserDraftRecord.localTime : "";
      const parserTimezone = typeof parserDraftRecord.timezone === "string" ? parserDraftRecord.timezone : "Etc/UTC";
      const parserLocation = typeof parserDraftRecord.location === "string" ? parserDraftRecord.location : "";
      const parserConfirmationCode =
        typeof parserDraftRecord.confirmationCode === "string" ? parserDraftRecord.confirmationCode : "";
      const parserNotesText = typeof parserDraftRecord.notes === "string" ? parserDraftRecord.notes : "";
      const parserAssignedToRaw = parserDraftRecord.assignedTo;
      const parserAssignedTo = Array.isArray(parserAssignedToRaw)
        ? parserAssignedToRaw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        : [];
      const rawFlightNumber =
        typeof parserDraftRecord.flightNumber === "string"
          ? parserDraftRecord.flightNumber.trim()
          : typeof parserDraftRecord.flight_number === "string"
            ? parserDraftRecord.flight_number.trim()
            : "";

      // Resolve the airline name — never use email provider names (Gmail, Yahoo, etc.)
      // as the airline. Fall back to the 2-letter IATA prefix from the flight number.
      const EMAIL_PROVIDER_NAMES = new Set(["gmail", "yahoo", "outlook", "hotmail", "icloud", "me", "aol"]);
      const rawAirline = parserProvider.trim();
      const isEmailProviderName = EMAIL_PROVIDER_NAMES.has(rawAirline.toLowerCase());

      // Infer IATA prefix if AI returned just the number (e.g. "832" → "AS832")
      const AIRLINE_IATA_MAP: Record<string, string> = {
        "alaska airlines": "AS", "alaska": "AS",
        "hawaiian airlines": "HA", "hawaiian": "HA",
        "united airlines": "UA", "united": "UA",
        "american airlines": "AA", "american": "AA",
        "delta air lines": "DL", "delta": "DL",
        "southwest airlines": "WN", "southwest": "WN",
        "jetblue": "B6",
        "korean air": "KE",
        "ana": "NH", "all nippon airways": "NH",
        "japan airlines": "JL", "jal": "JL",
        "lufthansa": "LH", "british airways": "BA",
        "air france": "AF", "emirates": "EK",
        "cathay pacific": "CX", "singapore airlines": "SQ",
        "qantas": "QF", "air canada": "AC",
      };
      const hasIataPrefix = /^[A-Z]{2}\d/i.test(rawFlightNumber);
      let parserFlightNumber = rawFlightNumber.toUpperCase();
      if (!hasIataPrefix && /^\d+$/.test(rawFlightNumber)) {
        const lowerProvider = rawAirline.toLowerCase();
        for (const [name, code] of Object.entries(AIRLINE_IATA_MAP)) {
          if (lowerProvider.includes(name)) {
            parserFlightNumber = `${code}${rawFlightNumber}`;
            break;
          }
        }
      }

      const iataPrefix = parserFlightNumber.slice(0, 2).toUpperCase();
      const resolvedAirline = parserType === "flight"
        ? (isEmailProviderName && iataPrefix.length === 2 ? `${iataPrefix} Airlines` : rawAirline || "Unknown Airline")
        : "";

      const parsedReservation = {
        id: `res-email-${generateId()}`,
        type: parserType,
        title: parserTitle,
        provider: parserProvider,
        localTime: parserLocalTime,
        timezone: parserTimezone || "Etc/UTC",
        location: parserLocation,
        confirmationCode: parserConfirmationCode,
        assignedTo: parserAssignedTo.length > 0 ? parserAssignedTo : defaultAssignees,
        stage: targetTrip.stage,
        critical: parserType === "flight" || parserType === "train" || parserType === "ride",
        confidence: confidenceToDraftValue(parserConfidenceScore),
        notes: parserNotesText,
        source: "imported" as const,
        flightNumber: parserType === "flight" ? parserFlightNumber : "",
        flightAirline: resolvedAirline,
        flightDate: parserType === "flight" ? parserLocalTime.slice(0, 10) : "",
        flightDepartureAirport: parserType === "flight"
          ? (typeof parserDraftRecord.departureAirport === "string" ? parserDraftRecord.departureAirport.trim().toUpperCase().slice(0, 4) : "")
          : "",
        flightArrivalAirport: parserType === "flight"
          ? (typeof parserDraftRecord.arrivalAirport === "string" ? parserDraftRecord.arrivalAirport.trim().toUpperCase().slice(0, 4) : "")
          : "",
        flightDepartureTime: parserType === "flight" && parserLocalTime ? parserLocalTime : "",
        checkOutDate: parserType === "hotel"
          ? (typeof parserDraftRecord.checkOutDate === "string" ? parserDraftRecord.checkOutDate.trim().slice(0, 10) : "")
          : "",
      };

      const matchingReservationIndex = nextReservations.findIndex((reservation) =>
        isDuplicateReservation(reservation, parsedReservation),
      );
      const hasMatchingReservation = matchingReservationIndex !== -1;
      // Only check queue for duplicates (not adding to queue anymore, but keep for safety)
      const hasMatchingQueuedDraft = isDuplicateAgainstReviewQueue(nextQueue, parsedReservation);
      if (hasMatchingReservation || hasMatchingQueuedDraft) {
        // For hotels: merge new info into existing reservation rather than dropping
        // This handles the case where user forwards the same email again with more info
        if (hasMatchingReservation && parserType === "hotel") {
          const existing = nextReservations[matchingReservationIndex];
          const existingRecord = existing as typeof existing & Record<string, unknown>;
          const hasCheckout = typeof existingRecord.checkOutDate === "string" && (existingRecord.checkOutDate as string).trim().length > 0;
          const hasConfirmation = existing.confirmationCode.trim().length > 0;
          if (!hasCheckout || !hasConfirmation) {
            // Merge: fill in missing fields from the new parse
            nextReservations = nextReservations.map((r, idx) => {
              if (idx !== matchingReservationIndex) return r;
              return {
                ...r,
                confirmationCode: r.confirmationCode.trim() || parserConfirmationCode,
                notes: [r.notes, parserNotesText].filter(Boolean).join(" "),
                ...(!hasCheckout && parserLocalTime ? {} : {}),
              };
            });
            routeLogger.info("Duplicate hotel reservation merged with new info.", {
              userId: targetUserId,
              tripId: targetTrip.id,
              provider: parserProvider || null,
            });
            acceptedDraftCount += 1;
            continue;
          }
        }
        duplicateDraftCount += 1;
        routeLogger.info("Duplicate forwarded reservation dropped.", {
          userId: targetUserId,
          tripId: targetTrip.id,
          confirmationCode: parserConfirmationCode || null,
          provider: parserProvider || null,
          localTime: parserLocalTime || null,
          matchedExistingReservation: hasMatchingReservation,
          matchedQueuedDraft: hasMatchingQueuedDraft,
        });
        continue;
      }

      // Smart routing: high confidence = auto-accept. Low confidence or missing
      // critical fields = review queue so user can fix the specific problem.
      const isCriticalFieldMissing = !parserLocalTime.trim() ||
        (parserType === "flight" && !parserFlightNumber.trim());
      const needsReview = isCriticalFieldMissing ||
        parserParsingStatus === "needs-user-input" ||
        parserConfidenceScore < 40;

      if (needsReview) {
        const missingDesc = parserMissingFields.length > 0
          ? `Could not read: ${parserMissingFields.join(", ")}. Please confirm these fields.`
          : isCriticalFieldMissing
            ? "We could not find the date or flight number. Please fill them in."
            : "Please confirm this reservation looks correct.";
        const reviewItem = {
          id: `review-email-${generateId()}`,
          reasons: [missingDesc],
          impact: "Tap 'Open details' to fill in the missing info and save.",
          sourceEmailSubject: parsed.data.subject?.trim() || "Forwarded email",
          draft: {
            type: parserType,
            title: parserTitle,
            provider: parserProvider,
            localTime: parserLocalTime,
            timezone: parserTimezone || "Etc/UTC",
            location: parserLocation,
            confirmationCode: parserConfirmationCode,
            assignedTo: defaultAssignees,
            stage: targetTrip.stage,
            critical: parserType === "flight" || parserType === "train" || parserType === "ride",
            confidence: confidenceToDraftValue(parserConfidenceScore),
            notes: parserNotesText,
            flightNumber: parserType === "flight" ? parserFlightNumber : "",
            flightAirline: resolvedAirline,
            flightDate: parserType === "flight" ? parserLocalTime.slice(0, 10) : "",
          },
          sourceChannel: "email-forward" as const,
          parseConfidenceScore: parserConfidenceScore,
          parsingStatus: parserParsingStatus,
          missingFields: parserMissingFields,
          originalEmailText: parserOriginalEmailText,
          hasPdfAttachment: parserHasPdfAttachment,
          imageBasedEmail: parserImageBasedEmail,
          reviewStatus: "pending" as const,
          parserNotes,
        };
        nextQueue = [reviewItem, ...nextQueue];
        routeLogger.info("Forwarded reservation needs review.", {
          userId: targetUserId,
          tripId: targetTrip.id,
          type: parserType,
          confidenceScore: parserConfidenceScore,
          missingFields: parserMissingFields,
          isCriticalFieldMissing,
        });
      } else {
        nextReservations = [parsedReservation, ...nextReservations];
        routeLogger.info("Forwarded reservation auto-accepted.", {
          userId: targetUserId,
          tripId: targetTrip.id,
          type: parserType,
          provider: parserProvider,
          flightNumber: parserFlightNumber || null,
          localTime: parserLocalTime,
          confirmationCode: parserConfirmationCode || null,
        });
      }
      acceptedDraftCount += 1;
    }

    if (acceptedDraftCount === 0) {
      return {
        ok: true,
        status: 200,
        message: duplicateDraftCount > 0 ? "Duplicate reservation dropped." : "No reservation extracted from email.",
        userId: targetUserId,
        tripId: targetTrip.id,
      };
    }

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
      return { ok: false, status: 500, message: "Trip update failed.", userId: targetUserId, tripId: targetTrip.id };
    }

    const notificationSent = await sendPushNotification(targetUserId, {
      title: "Forwarded reservation received",
      body: buildPushBody(parserConfidenceScore),
      url: `/travel-assistant?tripId=${encodeURIComponent(targetTrip.id)}`,
    });

    routeLogger.info("Forwarded email parsed into review queue.", {
      userId: targetUserId,
      tripId: targetTrip.id,
      acceptedDraftCount,
      duplicateDraftCount,
      score: parserConfidenceScore,
      status: parserParsingStatus,
      usedAiFallback: parserUsedAiFallback,
      notificationSent,
    });
    return {
      ok: true,
      status: 200,
      message: "Forwarded email parsed into review queue.",
      userId: targetUserId,
      tripId: targetTrip.id,
    };
  } catch (error) {
    console.error("[email-forward-webhook] Unhandled processing error.", {
      requestId,
      error,
    });
    return { ok: false, status: 500, message: "Unhandled email forward processing error." };
  }
}

export async function POST(req: Request) {
  try {
    const requestId = req.headers.get("x-request-id")?.trim() || generateId();
    const result = await processEmailForwardWebhook(req, requestId);
    return NextResponse.json(
      {
        ok: result.ok,
        accepted: result.ok,
        message: result.message,
        userId: result.userId,
        tripId: result.tripId,
      },
      { status: result.status },
    );
  } catch (error) {
    console.error("[email-forward-webhook] Failed to process webhook.", {
      error,
    });
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        message: "Email forward webhook failed",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Email forward webhook is running",
  });
}
