/**
 * Detect archive / historical confirmation emails so we don't invent future stays (I45).
 * Uses original Date:/Sent: from forward envelopes before strip.
 */

const EMAIL_SENT_DATE_RE =
  /^(?:Date|Sent):\s*(.+)$/imu;

const ARCHIVE_AGE_MS = 400 * 86_400_000; // ~13 months — clearly not this trip season

export function extractOriginalEmailSentAtMs(rawEmailText: string): number | null {
  const match = rawEmailText.match(EMAIL_SENT_DATE_RE);
  if (!match?.[1]) return null;
  const cleaned = match[1]
    .trim()
    .replace(/\s+at\s+/iu, " ")
    .replace(/\s+\([^)]*\)\s*$/u, "");
  const parsed = Date.parse(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function emailLooksLikeHistoricalArchive(
  rawEmailText: string,
  nowMs = Date.now(),
): { archive: boolean; sentAtMs: number | null; reason?: string } {
  const sentAtMs = extractOriginalEmailSentAtMs(rawEmailText);
  if (sentAtMs == null) return { archive: false, sentAtMs: null };
  if (nowMs - sentAtMs < ARCHIVE_AGE_MS) {
    return { archive: false, sentAtMs };
  }
  const year = new Date(sentAtMs).getUTCFullYear();
  return {
    archive: true,
    sentAtMs,
    reason: `Original email is from ${year} — looks like an old confirmation, not this trip.`,
  };
}

/** Hotel body has no Check-in/Checkout stay card — don't invent dates. */
export function hotelEmailMissingStayDates(text: string): boolean {
  const hasCheckIn = /\bcheck[\s-]?in\b/iu.test(text);
  const hasCheckOut = /\bcheck[\s-]?out\b/iu.test(text);
  // Payment-only confirmations (Summer In Italy style) lack stay labels.
  if (!hasCheckIn || !hasCheckOut) return true;
  return false;
}

export function evaluateHistoricalHotelForward(input: {
  type: string;
  rawEmailText: string;
  localTime?: string;
  nowMs?: number;
}): { blockAutoImport: boolean; reasons: string[]; clearInventedDates: boolean } {
  if (input.type !== "hotel") {
    return { blockAutoImport: false, reasons: [], clearInventedDates: false };
  }
  const archive = emailLooksLikeHistoricalArchive(input.rawEmailText, input.nowMs);
  const missingStay = hotelEmailMissingStayDates(input.rawEmailText);
  const reasons: string[] = [];
  if (archive.archive && archive.reason) reasons.push(archive.reason);
  if (missingStay) {
    reasons.push("No Check-in/Checkout dates in the email — do not invent a future stay.");
  }
  if (archive.archive && missingStay) {
    return { blockAutoImport: true, reasons, clearInventedDates: true };
  }
  if (missingStay && !input.localTime?.trim()) {
    return {
      blockAutoImport: true,
      reasons: reasons.length > 0 ? reasons : ["Hotel confirmation is missing stay dates."],
      clearInventedDates: false,
    };
  }
  return { blockAutoImport: false, reasons: [], clearInventedDates: false };
}
