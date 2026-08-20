import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  collectGmailAttachmentRefs,
  createAuthorizedGmailClient,
  decodeBase64UrlToBuffer,
  extractGmailBodyText,
  type GmailApiClient,
} from "@/lib/travelAssistant/gmailImportProvider";
import { extractConfirmationPlainText } from "@/lib/travelAssistant/confirmationDocumentText";
import {
  appendPdfAttachmentText,
  shouldReplaceStoredSourceText,
  truncateEmailSourceText,
} from "@/lib/travelAssistant/emailSourceText";
import { applyIncomingSourceToPnrGroup } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import { resolveReservationMiles } from "@/lib/travelAssistant/parseReservationMiles";
import { unpricedConfirmationCodes } from "@/lib/travelAssistant/pricingDiagnostics";
import { logger } from "@/lib/logger";

const SWEEP_SCOPE = "travelAssistant/gmailPricingSweep";
const MESSAGES_PER_CODE = 8;
const SWEEP_TIME_BUDGET_MS = 30_000;

function isPdfAttachment(filename: string, mimeType: string): boolean {
  return filename.toLowerCase().endsWith(".pdf") || mimeType.toLowerCase().includes("pdf");
}

function priceFoundForCode(text: string, code: string): boolean {
  if (!text.toUpperCase().includes(code)) return false;
  const cash = resolveReservationCashUsd({ originalEmailText: text, confirmationCode: code });
  if (cash != null && cash > 0) return true;
  const miles = resolveReservationMiles({ originalEmailText: text, confirmationCode: code });
  return miles.milesSpent != null && miles.milesSpent > 0;
}

async function readMessageSourceText(
  gmailClient: GmailApiClient,
  messageId: string,
): Promise<string> {
  const message = await gmailClient.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  const payload = message.data.payload ?? null;
  let text = extractGmailBodyText(payload);

  const attachmentsApi = gmailClient.users.messages.attachments;
  if (!attachmentsApi) return text;

  for (const ref of collectGmailAttachmentRefs(payload)) {
    if (!isPdfAttachment(ref.filename, ref.mimeType)) continue;
    try {
      const attachment = await attachmentsApi.get({
        userId: "me",
        messageId,
        id: ref.attachmentId,
      });
      const data = attachment.data.data;
      if (!data) continue;
      const pdfText = await extractConfirmationPlainText(decodeBase64UrlToBuffer(data), "pdf");
      if (pdfText.trim()) {
        text = appendPdfAttachmentText(text, pdfText);
      }
    } catch (error) {
      logger.warn("Gmail attachment fetch failed during pricing sweep.", {
        scope: SWEEP_SCOPE,
        messageId,
        filename: ref.filename,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return text;
}

export interface GmailPricingSweepResult {
  reservations: SessionReservation[];
  codesRecovered: string[];
  codesSearched: string[];
  gmailAvailable: boolean;
}

/**
 * G40 — search the traveler's Gmail for the receipt behind an unpriced
 * confirmation, including PDF attachments, so no fare is typed by hand.
 */
export async function sweepGmailForMissingPrices(
  userId: string,
  reservations: SessionReservation[],
  gmailClientOverride?: GmailApiClient,
): Promise<GmailPricingSweepResult> {
  const codesSearched = unpricedConfirmationCodes(reservations);
  if (codesSearched.length === 0) {
    return { reservations, codesRecovered: [], codesSearched, gmailAvailable: true };
  }

  const gmailClient = gmailClientOverride ?? (await createAuthorizedGmailClient(userId));
  if (!gmailClient) {
    logger.info("Gmail pricing sweep skipped — mailbox not connected.", {
      scope: SWEEP_SCOPE,
      userId,
      codesSearched,
    });
    return { reservations, codesRecovered: [], codesSearched, gmailAvailable: false };
  }

  const deadline = Date.now() + SWEEP_TIME_BUDGET_MS;
  const bestSourceByCode = new Map<string, string>();

  for (const code of codesSearched) {
    if (Date.now() > deadline) break;
    try {
      const listResponse = await gmailClient.users.messages.list({
        userId: "me",
        q: `"${code}"`,
        maxResults: MESSAGES_PER_CODE,
      });
      const messageIds = (listResponse.data.messages ?? [])
        .map((message) => message?.id ?? null)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      for (const messageId of messageIds) {
        if (Date.now() > deadline) break;
        const text = await readMessageSourceText(gmailClient, messageId);
        if (!text.trim() || !priceFoundForCode(text, code)) continue;
        const stored = truncateEmailSourceText(text);
        const current = bestSourceByCode.get(code) ?? "";
        if (!current || shouldReplaceStoredSourceText(current, stored)) {
          bestSourceByCode.set(code, stored);
        }
        break;
      }
    } catch (error) {
      logger.warn("Gmail search failed during pricing sweep.", {
        scope: SWEEP_SCOPE,
        code,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  if (bestSourceByCode.size === 0) {
    return { reservations, codesRecovered: [], codesSearched, gmailAvailable: true };
  }

  let next = reservations;
  for (const [code, sourceText] of bestSourceByCode) {
    next = applyIncomingSourceToPnrGroup(next, sourceText, code);
  }

  const codesRecovered = [...bestSourceByCode.keys()];
  logger.info("Recovered pricing from Gmail sweep.", {
    scope: SWEEP_SCOPE,
    codesRecovered,
  });

  return { reservations: next, codesRecovered, codesSearched, gmailAvailable: true };
}
