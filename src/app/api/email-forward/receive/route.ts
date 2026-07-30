import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { getResendClient } from "@/lib/email/resendClient";
import { logger } from "@/lib/logger";
import { parseForwardedEmail } from "@/lib/travelAssistant/emailForwardParser";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { resolveUserIdByForwardAddress } from "@/lib/travelAssistant/emailForwardSetupStore";
import { sendPushNotification } from "@/lib/travelAssistant/pushNotificationService";
import { updateTrip } from "@/lib/travelAssistant/tripStore";
import {
  detectFlightScheduleChange,
  expandTripWindowIfNeeded,
  mergeFlightReservationUpdate,
  recoverActiveTripIfEmptyShell,
  resolveTargetTripForDayPlanForward,
  resolveTargetTripForEmailForward,
} from "@/lib/travelAssistant/tripEmailAttach";
import { mergeReservationPricingFields } from "@/lib/travelAssistant/reservationPricingMerge";
import { reservationPrimaryDate, computeMinutesToDeparture, isTripShellConfigured, reservationWithinTripWindow } from "@/lib/travelAssistant/tripWindow";
import {
  findPlannedReplacementIndex,
  mergeIncomingOverPlanned,
} from "@/lib/travelAssistant/plannedReservationMatch";
import {
  dedupeFlightReservations,
  isSameFlightLeg,
} from "@/lib/travelAssistant/flightItinerarySync";
import { enrichReservationForAutoImport } from "@/lib/travelAssistant/autoImportReservation";
import { evaluateForwardedReservationGate } from "@/lib/travelAssistant/forwardedReservationGate";
import { evaluateHistoricalHotelForward } from "@/lib/travelAssistant/historicalEmailForward";
import {
  OUT_OF_WINDOW_REVIEW_REASON,
  selectDraftsToImport,
} from "@/lib/travelAssistant/forwardedDraftImport";
import { isDuplicateReservation } from "@/lib/travelAssistant/reservationDuplicates";
import { drainForwardReviewQueue } from "@/lib/travelAssistant/drainForwardReviewQueue";
import { getFewShotExamplesForEmail } from "@/lib/travelAssistant/mlReadiness/fewShotExamples";
import { EMAIL_FORWARD_PARSER_VERSION } from "@/lib/travelAssistant/mlReadiness/parserVersion";
import { extractAttachmentTextFromReceivedEmail } from "@/lib/travelAssistant/receivedEmailAttachmentText";
import {
  appendDocxAttachmentText,
  appendPdfAttachmentText,
  ensurePdfInSourceText,
  truncateEmailSourceText,
} from "@/lib/travelAssistant/emailSourceText";
import {
  applyDayPlanToItineraryPlans,
  parseDayPlanItinerary,
  remapParsedDayPlanToTripWindow,
} from "@/lib/travelAssistant/parseDayPlanItinerary";
import { normalizeItineraryPlans } from "@/lib/travelAssistant/itineraryDayPlan";
import { resolveReservationPricing, resolvePricingNearBooking } from "@/lib/travelAssistant/parseReservationMiles";
import { applyAcceptedReservationPricing } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";
import {
  extractReservationSourceLinks,
  resolveBoardingPassUrl,
} from "@/lib/travelAssistant/reservationLinks";
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

function buildPushBody(): string {
  return "New reservation added to your trip";
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

    const targetTripIdHint = parsed.data.tripId?.trim() || undefined;

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

    let pdfAttachmentText = "";
    let docxAttachmentText = "";
    let legacyDocFilenames: string[] = [];
    if (emailId) {
      const resendClient = getResendClient();
      if (resendClient) {
        const attachmentText = await extractAttachmentTextFromReceivedEmail(resendClient, emailId, {
          requestId,
        });
        pdfAttachmentText = attachmentText.pdfText;
        docxAttachmentText = attachmentText.docxText;
        legacyDocFilenames = attachmentText.legacyDocFilenames;
        if (pdfAttachmentText.trim()) {
          parserText = appendPdfAttachmentText(parserText, pdfAttachmentText);
          routeLogger.info("Appended PDF attachment text to forwarded email parser input.", {
            emailId,
            pdfTextLength: pdfAttachmentText.length,
          });
        }
        if (docxAttachmentText.trim()) {
          parserText = appendDocxAttachmentText(parserText, docxAttachmentText);
          routeLogger.info("Appended Word attachment text to forwarded email parser input.", {
            emailId,
            docxTextLength: docxAttachmentText.length,
          });
        }
        if (legacyDocFilenames.length > 0) {
          routeLogger.warn("Legacy .doc attachment skipped — re-save as .docx and forward again.", {
            emailId,
            filenames: legacyDocFilenames,
          });
        }
      }
    }

    const fewShotExamples = await getFewShotExamplesForEmail(parserText, {
      userId: targetUserId,
      limit: 3,
    });

    const parserResult = await parseForwardedEmail({
      subject: parserSubject,
      from: parserFrom,
      text: parserText,
      html: parserHtml,
      attachments: parserAttachments,
      fewShotExamples,
    });
    const parserDraftRecords = (
      parserResult.drafts.length > 0 ? parserResult.drafts : [parserResult.draft]
    ).map((candidate) => ({ ...candidate }) as Record<string, unknown>);
    const parserNotes = Array.isArray(parserResult?.parserNotes)
      ? parserResult.parserNotes.filter((note): note is string => typeof note === "string" && note.trim().length > 0)
      : [];
    const parserMissingFields = parserResult.missingFields;
    const parserConfidenceScore = Number.isFinite(parserResult?.confidenceScore) ? parserResult.confidenceScore : 0;
    const parserParsingStatus =
      parserResult?.parsingStatus === "auto-parsed" ||
      parserResult?.parsingStatus === "needs-review" ||
      parserResult?.parsingStatus === "needs-user-input"
        ? parserResult.parsingStatus
        : "needs-review";
    const parserOriginalEmailText =
      typeof parserResult?.originalEmailText === "string" ? parserResult.originalEmailText : "";
    const storedSourceText = truncateEmailSourceText(
      ensurePdfInSourceText(parserOriginalEmailText, pdfAttachmentText),
    );
    const parserHasPdfAttachment = Boolean(parserResult?.hasPdfAttachment);
    const parserImageBasedEmail = Boolean(parserResult?.imageBasedEmail);
    const parserUsedAiFallback = Boolean(parserResult?.usedAiFallback);

    // Detect narrative day plans BEFORE trip resolution so we never create/activate an empty shell.
    const earlyDayPlanSource = [docxAttachmentText, parserText].filter((t) => t.trim()).join("\n\n");
    const earlyDayPlan = parseDayPlanItinerary(earlyDayPlanSource, {
      subject: parserSubject,
    });
    const isDayPlanForward = Boolean(earlyDayPlan && earlyDayPlan.days.length >= 2);

    let targetTrip = isDayPlanForward
      ? await resolveTargetTripForDayPlanForward(
          targetUserId,
          earlyDayPlan!.days.map((day) => day.dateKey),
        )
      : await resolveTargetTripForEmailForward(
          targetUserId,
          targetTripIdHint,
          parserDraftRecords as Array<Record<string, unknown>>,
        );

    // Safety net: if we still landed on an empty shell, recover to the trip with bookings.
    if (targetTrip && (targetTrip.reservations?.length ?? 0) === 0) {
      const recovered = await recoverActiveTripIfEmptyShell(targetUserId);
      if (recovered.trip && (recovered.trip.reservations?.length ?? 0) > 0) {
        routeLogger.warn("Email forward retargeted from empty shell to trip with reservations.", {
          previousTripId: targetTrip.id,
          recoveredTripId: recovered.trip.id,
          reservationCount: recovered.trip.reservations.length,
          isDayPlanForward,
        });
        targetTrip = recovered.trip;
      }
    }

    if (!targetTrip) {
      console.error("[email-forward-webhook] Unable to resolve or create target trip.", {
        requestId,
        userId: targetUserId,
        tripId: targetTripIdHint ?? null,
      });
      return { ok: false, status: 500, message: "Unable to resolve target trip.", userId: targetUserId };
    }

    const defaultAssignees = Array.from(
      new Set(targetTrip.reservations.flatMap((reservation) => reservation.assignedTo)),
    );
    let nextReservations = [...targetTrip.reservations];
    let nextQueue = [...(targetTrip.reviewQueue ?? [])];
    let nextUpdateFeed = [...(targetTrip.updateFeed ?? [])];
    let acceptedDraftCount = 0;
    let duplicateDraftCount = 0;
    const emailSourceLinks = extractReservationSourceLinks({
      text: parserText,
      html: parserHtml,
    });
    const emailManageUrl =
      emailSourceLinks.find((link) => link.kind === "manage" || link.kind === "ticket" || link.kind === "checkin")
        ?.url ?? undefined;
    const emailSourceMetadata = {
      sourceEmailId: emailId || undefined,
      sourceEmailSubject: parserSubject.trim() || undefined,
      originalEmailText: storedSourceText || undefined,
      hasPdfAttachment: parserHasPdfAttachment || Boolean(pdfAttachmentText.trim()) || undefined,
      manageUrl: emailManageUrl,
      sourceLinks: emailSourceLinks.length > 0 ? emailSourceLinks : undefined,
    };
    // Day-plan Word docs are not booking confirmations — skip reservation import entirely.
    const draftsToImport = selectDraftsToImport(parserDraftRecords, isDayPlanForward);
    for (const parserDraftRecord of draftsToImport) {
      const draftPrimaryDate = reservationPrimaryDate({
        type: typeof parserDraftRecord.type === "string" ? parserDraftRecord.type : undefined,
        localTime: typeof parserDraftRecord.localTime === "string" ? parserDraftRecord.localTime : undefined,
        flightDate: typeof parserDraftRecord.flightDate === "string" ? parserDraftRecord.flightDate : undefined,
        flightDepartureTime:
          typeof parserDraftRecord.flightDepartureTime === "string"
            ? parserDraftRecord.flightDepartureTime
            : undefined,
        checkOutDate: typeof parserDraftRecord.checkOutDate === "string" ? parserDraftRecord.checkOutDate : undefined,
      });
      const rawType = parserDraftRecord.type;
      const parserType: SessionReservation["type"] =
        rawType === "flight" ||
        rawType === "hotel" ||
        rawType === "train" ||
        rawType === "ride" ||
        rawType === "dinner"
          ? rawType
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
        "ita airways": "AZ", "ita": "AZ", "alitalia": "AZ", "italian airways": "AZ",
        "ryanair": "FR", "easyjet": "U2", "wizz air": "W4", "vueling": "VY",
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
      const resolvedAirline =
        parserType === "flight"
          ? isEmailProviderName
            ? /^[A-Z]{2}\d/u.test(parserFlightNumber)
              ? `${iataPrefix} Airlines`
              : ""
            : rawAirline || "Unknown Airline"
          : "";

      const parserDepartureAirport =
        typeof parserDraftRecord.departureAirport === "string"
          ? parserDraftRecord.departureAirport.trim()
          : typeof parserDraftRecord.flightDepartureAirport === "string"
            ? parserDraftRecord.flightDepartureAirport.trim()
            : "";
      const parserArrivalAirport =
        typeof parserDraftRecord.arrivalAirport === "string"
          ? parserDraftRecord.arrivalAirport.trim()
          : typeof parserDraftRecord.flightArrivalAirport === "string"
            ? parserDraftRecord.flightArrivalAirport.trim()
            : "";

      const emailPricing = resolvePricingNearBooking({
        notes: parserNotesText,
        originalEmailText: storedSourceText || parserOriginalEmailText,
        confirmationCode: parserConfirmationCode,
        title: parserTitle,
        flightNumber: parserType === "flight" ? parserFlightNumber : undefined,
        departureAirport: parserType === "flight" ? parserDepartureAirport || undefined : undefined,
        arrivalAirport: parserType === "flight" ? parserArrivalAirport || undefined : undefined,
      });

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
        plannedOnly: false,
        quotedPriceUsd: emailPricing.cashUsd,
        quotedPointsMiles: emailPricing.milesSpent,
        quotedMilesEarned: emailPricing.milesEarned,
        pointsProgram: emailPricing.program,
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
        boardingPassUrl:
          parserType === "flight"
            ? resolveBoardingPassUrl({
                sourceLinks: emailSourceLinks,
                originalEmailText: storedSourceText || parserOriginalEmailText,
                html: parserHtml,
              })
            : undefined,
        ...emailSourceMetadata,
      };

      if (
        draftPrimaryDate &&
        isTripShellConfigured(targetTrip) &&
        !reservationWithinTripWindow(draftPrimaryDate, targetTrip.startDate, targetTrip.endDate)
      ) {
        nextQueue = [
          {
            id: `review-email-${generateId()}`,
            reasons: [OUT_OF_WINDOW_REVIEW_REASON],
            impact: "This booking falls outside your trip dates — confirm or move it before it goes live.",
            draft: {
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
              flightNumber: parserType === "flight" ? parserFlightNumber : "",
              flightAirline: resolvedAirline,
              flightDate: parserType === "flight" ? parserLocalTime.slice(0, 10) : "",
              flightDepartureAirport: parsedReservation.flightDepartureAirport,
              flightArrivalAirport: parsedReservation.flightArrivalAirport,
              flightDepartureTime: parsedReservation.flightDepartureTime,
              checkOutDate: parsedReservation.checkOutDate,
            },
            sourceChannel: "email-forward" as const,
            parseConfidenceScore: parserConfidenceScore,
            parsingStatus: parserParsingStatus,
            missingFields: parserMissingFields,
            reviewStatus: "pending" as const,
            parserNotes,
            parserVersion: parserResult.parserVersion ?? EMAIL_FORWARD_PARSER_VERSION,
            ...emailSourceMetadata,
          },
          ...nextQueue,
        ];
        routeLogger.info("Forwarded draft outside trip window queued for review.", {
          userId: targetUserId,
          tripId: targetTrip.id,
          draftPrimaryDate,
          tripStart: targetTrip.startDate,
          tripEnd: targetTrip.endDate,
        });
        acceptedDraftCount += 1;
        continue;
      }

      const plannedReplacementIndex = findPlannedReplacementIndex(nextReservations, parsedReservation);
      if (plannedReplacementIndex >= 0) {
        const replaced = mergeIncomingOverPlanned(
          nextReservations[plannedReplacementIndex] as SessionReservation,
          parsedReservation as SessionReservation,
        );
        nextReservations = nextReservations.map((reservation, index) =>
          index === plannedReplacementIndex ? replaced : reservation,
        );
        acceptedDraftCount += 1;
        routeLogger.info("Replaced planned leg with forwarded confirmation.", {
          userId: targetUserId,
          tripId: targetTrip.id,
          type: parserType,
          provider: parserProvider || null,
          flightNumber: parserFlightNumber || null,
          replacedReservationId: replaced.id,
        });
        continue;
      }

      const matchingReservationIndex = nextReservations.findIndex((reservation) =>
        isDuplicateReservation(reservation, parsedReservation),
      );
      const hasMatchingReservation = matchingReservationIndex !== -1;
      // Only check queue for duplicates (not adding to queue anymore, but keep for safety)
      const hasMatchingQueuedDraft = isDuplicateAgainstReviewQueue(nextQueue, parsedReservation);
      if (hasMatchingReservation && parserType === "flight") {
        const existing = nextReservations[matchingReservationIndex] as SessionReservation;
        const incoming = parsedReservation as SessionReservation;
        const scheduleChanges = detectFlightScheduleChange(existing, incoming);
        const merged = mergeFlightReservationUpdate(existing, incoming);
        nextReservations = nextReservations.map((reservation, index) =>
          index === matchingReservationIndex ? merged : reservation,
        );
        if (scheduleChanges.length > 0) {
          nextUpdateFeed = [
            {
              id: `feed-flight-change-${generateId()}`,
              reservationId: merged.id,
              kind: "flight-change",
              severity: "yellow",
              summary: "Your flights have changed — tap to review",
              detail: `Updated ${scheduleChanges.join(", ")} for ${merged.flightNumber || merged.title}.`,
              provider: merged.provider,
              appliedAt: new Date().toISOString(),
            },
            ...nextUpdateFeed,
          ];
        }
        acceptedDraftCount += 1;
        routeLogger.info("Flight refreshed from re-forwarded itinerary email.", {
          userId: targetUserId,
          tripId: targetTrip.id,
          reservationId: merged.id,
          scheduleChanges,
        });
        continue;
      }
      if (hasMatchingQueuedDraft) {
        const queueIndex = nextQueue.findIndex((item) => {
          const reviewItem = asRecord(item);
          const draft = asRecord(reviewItem?.draft);
          if (!draft) return false;
          return isDuplicateReservation(
            {
              type: typeof draft.type === "string" ? draft.type : "",
              provider: typeof draft.provider === "string" ? draft.provider : "",
              localTime: typeof draft.localTime === "string" ? draft.localTime : "",
              location: typeof draft.location === "string" ? draft.location : "",
              confirmationCode: typeof draft.confirmationCode === "string" ? draft.confirmationCode : "",
              flightNumber: typeof draft.flightNumber === "string" ? draft.flightNumber : "",
              flightDepartureAirport:
                typeof draft.flightDepartureAirport === "string" ? draft.flightDepartureAirport : "",
              flightArrivalAirport:
                typeof draft.flightArrivalAirport === "string" ? draft.flightArrivalAirport : "",
            },
            parsedReservation,
          );
        });
        if (queueIndex >= 0) {
          const reviewRecord = asRecord(nextQueue[queueIndex]) ?? {};
          const existingDraft = asRecord(reviewRecord.draft) ?? {};
          nextQueue = nextQueue.map((item, index) => {
            if (index !== queueIndex) return item;
            return {
              ...reviewRecord,
              draft: {
                ...existingDraft,
                title: parserTitle || existingDraft.title,
                provider: parserProvider || existingDraft.provider,
                localTime: parserLocalTime || existingDraft.localTime,
                timezone: parserTimezone || existingDraft.timezone,
                location: parserLocation || existingDraft.location,
                confirmationCode: parserConfirmationCode || existingDraft.confirmationCode,
                notes: [existingDraft.notes, parserNotesText].filter(Boolean).join(" ").trim(),
                flightNumber: parserFlightNumber || existingDraft.flightNumber,
                flightAirline: resolvedAirline || existingDraft.flightAirline,
                flightDate: parserLocalTime.slice(0, 10) || existingDraft.flightDate,
                flightDepartureAirport:
                  parsedReservation.flightDepartureAirport || existingDraft.flightDepartureAirport,
                flightArrivalAirport:
                  parsedReservation.flightArrivalAirport || existingDraft.flightArrivalAirport,
                flightDepartureTime: parserLocalTime || existingDraft.flightDepartureTime,
              },
              parseConfidenceScore: Math.max(
                typeof reviewRecord.parseConfidenceScore === "number" ? reviewRecord.parseConfidenceScore : 0,
                parserConfidenceScore,
              ),
              parsingStatus: parserParsingStatus,
              parserNotes,
            };
          });
          acceptedDraftCount += 1;
          routeLogger.info("Pending review flight refreshed from re-forwarded email.", {
            userId: targetUserId,
            tripId: targetTrip.id,
            flightNumber: parserFlightNumber || null,
          });
          continue;
        }
      }
      if (hasMatchingReservation || hasMatchingQueuedDraft) {
        // Merge pricing / email source when the same booking is forwarded again.
        if (hasMatchingReservation) {
          const existing = nextReservations[matchingReservationIndex] as SessionReservation;
          const incoming = parsedReservation as SessionReservation;
          const pricingMerged = applyAcceptedReservationPricing(
            mergeReservationPricingFields(existing, incoming),
          );
          if (pricingMerged !== existing) {
            nextReservations = nextReservations.map((reservation, index) =>
              index === matchingReservationIndex ? pricingMerged : reservation,
            );
            acceptedDraftCount += 1;
            routeLogger.info("Duplicate reservation merged with pricing from forwarded email.", {
              userId: targetUserId,
              tripId: targetTrip.id,
              type: parserType,
              provider: parserProvider || null,
            });
            continue;
          }
        }
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

      const sourceTextForArchive = storedSourceText || parserOriginalEmailText;
      const historicalGate = evaluateHistoricalHotelForward({
        type: parserType,
        rawEmailText: sourceTextForArchive,
        localTime: parserLocalTime,
      });
      let gatedLocalTime = parserLocalTime;
      let gatedCheckOut = parsedReservation.checkOutDate;
      if (historicalGate.clearInventedDates) {
        gatedLocalTime = "";
        gatedCheckOut = "";
      }

      const gateResult = evaluateForwardedReservationGate({
        type: parserType,
        localTime: gatedLocalTime,
        location: parserLocation,
        checkOutDate: gatedCheckOut,
        flightDepartureAirport: parsedReservation.flightDepartureAirport,
        flightArrivalAirport: parsedReservation.flightArrivalAirport,
        quotedPriceUsd: parsedReservation.quotedPriceUsd,
        confidenceScore: parserConfidenceScore,
        parsingStatus: historicalGate.blockAutoImport ? "needs-review" : parserParsingStatus,
        missingFields: parserMissingFields,
      });
      if (historicalGate.blockAutoImport) {
        gateResult.needsReview = true;
        gateResult.reasons = [...historicalGate.reasons, ...gateResult.reasons];
      }

      if (gateResult.needsReview) {
        nextQueue = [
          {
            id: `review-email-${generateId()}`,
            reasons: gateResult.reasons,
            impact: historicalGate.blockAutoImport
              ? "Old or incomplete hotel confirmation — not added to your trip until you confirm."
              : "This reservation needs a quick check before it's added to your trip.",
            draft: {
              type: parserType,
              title: parserTitle,
              provider: parserProvider,
              localTime: gatedLocalTime,
              timezone: parserTimezone || "Etc/UTC",
              location: parserLocation,
              confirmationCode: parserConfirmationCode,
              assignedTo: parserAssignedTo.length > 0 ? parserAssignedTo : defaultAssignees,
              stage: targetTrip.stage,
              critical: parserType === "flight" || parserType === "train" || parserType === "ride",
              confidence: confidenceToDraftValue(parserConfidenceScore),
              notes: parserNotesText,
              flightNumber: parserType === "flight" ? parserFlightNumber : "",
              flightAirline: resolvedAirline,
              flightDate: parserType === "flight" ? parserLocalTime.slice(0, 10) : "",
              flightDepartureAirport: parsedReservation.flightDepartureAirport,
              flightArrivalAirport: parsedReservation.flightArrivalAirport,
              flightDepartureTime: parsedReservation.flightDepartureTime,
              checkOutDate: gatedCheckOut,
            },
            sourceChannel: "email-forward" as const,
            parseConfidenceScore: parserConfidenceScore,
            parsingStatus: parserParsingStatus,
            missingFields: parserMissingFields,
            reviewStatus: "pending" as const,
            parserNotes,
            parserVersion: parserResult.parserVersion ?? EMAIL_FORWARD_PARSER_VERSION,
            ...emailSourceMetadata,
          },
          ...nextQueue,
        ];
        routeLogger.info("Forwarded reservation routed to review queue (did not meet auto-import bar).", {
          userId: targetUserId,
          tripId: targetTrip.id,
          type: parserType,
          confidenceScore: parserConfidenceScore,
          reasons: gateResult.reasons,
          historicalArchive: historicalGate.blockAutoImport,
        });
        acceptedDraftCount += 1;
        continue;
      }

      const enrichedFields = enrichReservationForAutoImport({
        type: parserType,
        title: parserTitle,
        provider: parserProvider,
        localTime: parserLocalTime,
        timezone: parserTimezone || "Etc/UTC",
        location: parserLocation,
        confirmationCode: parserConfirmationCode,
        notes: parserNotesText,
        flightNumber: parserType === "flight" ? parserFlightNumber : "",
        flightAirline: resolvedAirline,
        flightDate: parserType === "flight" ? parserLocalTime.slice(0, 10) : "",
        flightDepartureAirport:
          parserType === "flight" ? parsedReservation.flightDepartureAirport : "",
        flightArrivalAirport:
          parserType === "flight" ? parsedReservation.flightArrivalAirport : "",
        flightDepartureTime: parserType === "flight" && parserLocalTime ? parserLocalTime : "",
        checkOutDate: parserType === "hotel" ? parsedReservation.checkOutDate : "",
      });

      const autoImportedReservation: SessionReservation = {
        ...(parsedReservation as SessionReservation),
        type: enrichedFields.type,
        title: enrichedFields.title,
        provider: enrichedFields.provider,
        localTime: enrichedFields.localTime,
        timezone: enrichedFields.timezone,
        location: enrichedFields.location,
        notes: enrichedFields.notes,
        flightNumber: enrichedFields.flightNumber ?? parsedReservation.flightNumber,
        flightAirline: enrichedFields.flightAirline ?? parsedReservation.flightAirline,
        flightDate: enrichedFields.flightDate ?? parsedReservation.flightDate,
        flightDepartureAirport: enrichedFields.flightDepartureAirport ?? parsedReservation.flightDepartureAirport,
        flightArrivalAirport: enrichedFields.flightArrivalAirport ?? parsedReservation.flightArrivalAirport,
        flightDepartureTime: enrichedFields.flightDepartureTime ?? parsedReservation.flightDepartureTime,
      };
      nextReservations = [autoImportedReservation, ...nextReservations];
      routeLogger.info("Forwarded reservation auto-imported to live trip.", {
        userId: targetUserId,
        tripId: targetTrip.id,
        type: parserType,
        provider: enrichedFields.provider,
        flightNumber: parserFlightNumber || null,
        localTime: enrichedFields.localTime,
        confirmationCode: parserConfirmationCode || null,
        confidenceScore: parserConfidenceScore,
        missingFields: parserMissingFields,
      });
      acceptedDraftCount += 1;
    }

    // Narrative Word/email day plans → Plan tab day notes (not reservation cards).
    const parsedDayPlan =
      earlyDayPlan ??
      parseDayPlanItinerary(earlyDayPlanSource, {
        subject: parserSubject,
        tripStartDate: targetTrip.startDate,
        tripEndDate: targetTrip.endDate,
      });
    // Re-parse with trip year once we know the target trip dates, then force
    // month/day dates into this trip window (Word docs often omit / misstate year).
    const parsedDayPlanForTripRaw =
      parseDayPlanItinerary(earlyDayPlanSource, {
        subject: parserSubject,
        tripStartDate: targetTrip.startDate,
        tripEndDate: targetTrip.endDate,
      }) ?? parsedDayPlan;
    const parsedDayPlanForTrip = parsedDayPlanForTripRaw
      ? remapParsedDayPlanToTripWindow(
          parsedDayPlanForTripRaw,
          targetTrip.startDate,
          targetTrip.endDate,
        )
      : null;
    let dayPlanDaysApplied = 0;
    let nextItineraryPlans = targetTrip.itineraryPlans
      ? normalizeItineraryPlans(targetTrip.itineraryPlans)
      : undefined;
    if (parsedDayPlanForTrip) {
      const applied = applyDayPlanToItineraryPlans(nextItineraryPlans, parsedDayPlanForTrip);
      nextItineraryPlans = applied.plans;
      dayPlanDaysApplied = applied.daysApplied;
      if (dayPlanDaysApplied > 0) {
        nextUpdateFeed = [
          {
            id: `feed-dayplan-${generateId()}`,
            reservationId: "",
            kind: "day-plan-itinerary",
            severity: "info",
            summary: parsedDayPlanForTrip.title || "Day plan itinerary",
            detail: `Applied ${dayPlanDaysApplied} day${dayPlanDaysApplied === 1 ? "" : "s"} to ${targetTrip.name} (dates inside this trip).`,
            provider: "email-forward",
            appliedAt: new Date().toISOString(),
          },
          ...nextUpdateFeed,
        ];
      }
      routeLogger.info("Parsed forwarded day-plan itinerary.", {
        userId: targetUserId,
        tripId: targetTrip.id,
        tripName: targetTrip.name,
        title: parsedDayPlanForTrip.title,
        daysFound: parsedDayPlanForTrip.days.length,
        daysApplied: dayPlanDaysApplied,
        confidence: parsedDayPlanForTrip.confidence,
        reservationCountOnTrip: targetTrip.reservations?.length ?? 0,
      });
    }

    if (acceptedDraftCount === 0 && dayPlanDaysApplied === 0) {
      const legacyHint =
        legacyDocFilenames.length > 0
          ? " Old Word .doc files are not supported — save as .docx and forward again."
          : "";
      return {
        ok: true,
        status: 200,
        message:
          duplicateDraftCount > 0
            ? "Duplicate reservation dropped."
            : `No reservation or day plan extracted from email.${legacyHint}`,
        userId: targetUserId,
        tripId: targetTrip.id,
      };
    }

    const dayPlanOnly = dayPlanDaysApplied > 0 && acceptedDraftCount === 0;

    let tripWindowPatch: { startDate: string; endDate: string } | null = null;
    if (!dayPlanOnly) {
      nextReservations = dedupeFlightReservations(nextReservations);
      const drained = drainForwardReviewQueue(nextReservations, nextQueue, () => `res-email-${generateId()}`);
      nextReservations = drained.reservations;
      nextQueue = drained.reviewQueue;

      const reservationDates = nextReservations
        .map((reservation) => reservationPrimaryDate(reservation))
        .filter((value) => value.length > 0);
      for (const reservationDate of reservationDates) {
        const expanded = expandTripWindowIfNeeded(targetTrip, reservationDate);
        if (expanded) {
          tripWindowPatch = tripWindowPatch
            ? {
                startDate:
                  expanded.startDate < tripWindowPatch.startDate ? expanded.startDate : tripWindowPatch.startDate,
                endDate: expanded.endDate > tripWindowPatch.endDate ? expanded.endDate : tripWindowPatch.endDate,
              }
            : expanded;
        }
      }
    }

    // Expand trip window from day-plan dates when needed (never shrink / never rewrite reservations).
    if (parsedDayPlanForTrip) {
      for (const day of parsedDayPlanForTrip.days) {
        const expanded = expandTripWindowIfNeeded(targetTrip, day.dateKey);
        if (expanded) {
          tripWindowPatch = tripWindowPatch
            ? {
                startDate:
                  expanded.startDate < tripWindowPatch.startDate ? expanded.startDate : tripWindowPatch.startDate,
                endDate: expanded.endDate > tripWindowPatch.endDate ? expanded.endDate : tripWindowPatch.endDate,
              }
            : expanded;
        }
      }
    }

    // CRITICAL: day-plan-only patches must NOT include reservations — omit so updateTrip keeps existing bookings.
    const updated = await updateTrip(
      targetTrip.id,
      dayPlanOnly
        ? {
            updateFeed: nextUpdateFeed,
            ...(nextItineraryPlans ? { itineraryPlans: nextItineraryPlans } : {}),
            ...(tripWindowPatch ?? {}),
          }
        : {
            reservations: nextReservations,
            reviewQueue: nextQueue,
            updateFeed: nextUpdateFeed,
            ...(nextItineraryPlans ? { itineraryPlans: nextItineraryPlans } : {}),
            ...(tripWindowPatch ?? {}),
            minutesToDeparture:
              computeMinutesToDeparture({
                startDate: tripWindowPatch?.startDate ?? targetTrip.startDate,
                reservations: nextReservations,
              }) ?? targetTrip.minutesToDeparture,
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

    const notifyPlanTab = dayPlanDaysApplied > 0 && acceptedDraftCount === 0;
    const notificationSent = await sendPushNotification(targetUserId, {
      title: notifyPlanTab ? "Day plan itinerary received" : "Forwarded reservation received",
      body: notifyPlanTab
        ? `${parsedDayPlanForTrip?.title ?? "Itinerary"} — ${dayPlanDaysApplied} days added to ${targetTrip.name}.`
        : buildPushBody(),
      url: `/travel-assistant?tripId=${encodeURIComponent(targetTrip.id)}&tab=${notifyPlanTab ? "itinerary" : "flights"}`,
    });

    routeLogger.info("Forwarded email auto-imported to live trip.", {
      userId: targetUserId,
      tripId: targetTrip.id,
      acceptedDraftCount,
      duplicateDraftCount,
      dayPlanDaysApplied,
      score: parserConfidenceScore,
      status: parserParsingStatus,
      usedAiFallback: parserUsedAiFallback,
      notificationSent,
    });
    return {
      ok: true,
      status: 200,
      message:
        dayPlanDaysApplied > 0 && acceptedDraftCount === 0
          ? `Day plan applied to ${targetTrip.name} (${dayPlanDaysApplied} days). Open the Plan tab.`
          : dayPlanDaysApplied > 0
            ? `Forwarded email imported to ${targetTrip.name} (${acceptedDraftCount} reservations, ${dayPlanDaysApplied} plan days).`
            : "Forwarded email auto-imported to live trip.",
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
