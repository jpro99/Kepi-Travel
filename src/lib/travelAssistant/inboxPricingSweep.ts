import "server-only";

import type { Resend } from "resend";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { fetchReceivedEmailSourceText } from "@/lib/travelAssistant/receivedEmailPdfText";
import {
  shouldReplaceStoredSourceText,
  sourceTextHasPricingSignal,
  truncateEmailSourceText,
} from "@/lib/travelAssistant/emailSourceText";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import { resolveReservationMiles } from "@/lib/travelAssistant/parseReservationMiles";
import { applyIncomingSourceToPnrGroup } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";
import { unpricedConfirmationCodes } from "@/lib/travelAssistant/pricingDiagnostics";
import { logger } from "@/lib/logger";

export { unpricedConfirmationCodes };

const SWEEP_SCOPE = "travelAssistant/inboxPricingSweep";
const MAX_EMAILS_SCANNED = 120;
const PAGE_SIZE = 50;
/** Route budget is 60s — leave room for parsing and the trip save. */
const SWEEP_TIME_BUDGET_MS = 35_000;

function textPricesCode(text: string, code: string): boolean {
  if (!text.toUpperCase().includes(code)) return false;
  if (!sourceTextHasPricingSignal(text)) return false;
  const cash = resolveReservationCashUsd({ originalEmailText: text, confirmationCode: code });
  if (cash != null && cash > 0) return true;
  const miles = resolveReservationMiles({ originalEmailText: text, confirmationCode: code });
  return miles.milesSpent != null && miles.milesSpent > 0;
}

async function listReceivedEmailIds(resendClient: Resend): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;

  while (ids.length < MAX_EMAILS_SCANNED) {
    const response = await resendClient.emails.receiving.list(
      after ? { limit: PAGE_SIZE, after } : { limit: PAGE_SIZE },
    );
    if (response.error || !response.data) {
      logger.warn("Resend inbox list failed during pricing sweep.", {
        scope: SWEEP_SCOPE,
        error: response.error?.message ?? "unknown",
      });
      break;
    }
    const page = response.data.data ?? [];
    for (const email of page) {
      if (email.id) ids.push(email.id);
    }
    if (!response.data.has_more || page.length === 0) break;
    after = page[page.length - 1]?.id;
    if (!after) break;
  }

  return ids.slice(0, MAX_EMAILS_SCANNED);
}

export interface InboxPricingSweepResult {
  reservations: SessionReservation[];
  emailsScanned: number;
  codesRecovered: string[];
}

/**
 * G39 — hunt the Kepi inbox for the receipt behind an unpriced confirmation.
 * Re-forwarded itineraries used to overwrite fares; this finds the original
 * email again so the traveler never types a price by hand.
 */
export async function sweepInboxForMissingPrices(
  resendClient: Resend,
  reservations: SessionReservation[],
): Promise<InboxPricingSweepResult> {
  const wantedCodes = unpricedConfirmationCodes(reservations);
  if (wantedCodes.length === 0) {
    return { reservations, emailsScanned: 0, codesRecovered: [] };
  }

  let emailIds: string[] = [];
  try {
    emailIds = await listReceivedEmailIds(resendClient);
  } catch (error) {
    logger.warn("Resend inbox list threw during pricing sweep.", {
      scope: SWEEP_SCOPE,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { reservations, emailsScanned: 0, codesRecovered: [] };
  }
  if (emailIds.length === 0) {
    return { reservations, emailsScanned: 0, codesRecovered: [] };
  }

  const bestSourceByCode = new Map<string, string>();
  let emailsScanned = 0;
  const remainingCodes = new Set(wantedCodes);
  const deadline = Date.now() + SWEEP_TIME_BUDGET_MS;

  for (const emailId of emailIds) {
    if (remainingCodes.size === 0) break;
    if (Date.now() > deadline) {
      logger.info("Inbox pricing sweep stopped at time budget.", {
        scope: SWEEP_SCOPE,
        emailsScanned,
        remainingCodes: [...remainingCodes],
      });
      break;
    }
    const fetched = await fetchReceivedEmailSourceText(resendClient, emailId, { scope: SWEEP_SCOPE });
    emailsScanned += 1;
    const text = fetched?.text?.trim();
    if (!text) continue;

    for (const code of [...remainingCodes]) {
      if (!textPricesCode(text, code)) continue;
      const stored = truncateEmailSourceText(text);
      const current = bestSourceByCode.get(code) ?? "";
      if (!current || shouldReplaceStoredSourceText(current, stored)) {
        bestSourceByCode.set(code, stored);
      }
      remainingCodes.delete(code);
    }
  }

  if (bestSourceByCode.size === 0) {
    return { reservations, emailsScanned, codesRecovered: [] };
  }

  let next = reservations;
  for (const [code, sourceText] of bestSourceByCode) {
    next = applyIncomingSourceToPnrGroup(next, sourceText, code);
  }

  const codesRecovered = [...bestSourceByCode.keys()];
  logger.info("Recovered pricing from Kepi inbox sweep.", {
    scope: SWEEP_SCOPE,
    emailsScanned,
    codesRecovered,
  });

  return { reservations: next, emailsScanned, codesRecovered };
}
