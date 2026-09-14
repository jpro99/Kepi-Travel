/**
 * G66 — Strip OTA confirmation footers from Plan bullets and day-plan imports.
 * Airbnb/Booking marketing blocks are never traveler-useful day activities.
 */

const FOOTER_LINE_RE =
  /^(?:\[image:[^\]]*\]|get the app\.?|the fastest, easiest way to airbnb\.?|app store|google play|update your email preferences|airbnb,?\s*inc\.?|https?:\/\/\S+|<\s*https?:\/\/[^>]+>)$/iu;

const FOOTER_SUBSTRING_RE =
  /\b(?:888\s+brannan|interstitial\?|email preferences|airbnb,\s*inc)\b/iu;

const STAY_METADATA_BULLET_RE =
  /^(?:guests|house rules|cancellation policy|scheduled payment|payment is scheduled|you will be charged|not included|includes?)\b/iu;

const GUEST_COUNT_BULLET_RE = /^\d+\s+(?:adult|guest)s?\b/iu;

const ORPHAN_CHECKOUT_TIME_RE = /^(?:by\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)\.?$/iu;

/** Single Plan bullet line that is email footer / marketing / stay-metadata noise. */
export function isOtaEmailFooterLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (FOOTER_LINE_RE.test(trimmed)) return true;
  if (FOOTER_SUBSTRING_RE.test(trimmed)) return true;
  if (STAY_METADATA_BULLET_RE.test(trimmed)) return true;
  if (GUEST_COUNT_BULLET_RE.test(trimmed)) return true;
  if (ORPHAN_CHECKOUT_TIME_RE.test(trimmed)) return true;
  if (/^guests$/iu.test(trimmed)) return true;
  return false;
}

/** Booking confirmation — not a Word day-plan itinerary (I50 guard). */
export function isOtaBookingConfirmation(text: string, subject = ""): boolean {
  const combined = `${subject}\n${text}`.trim();
  if (!/\b(?:airbnb|booking\.com|vrbo|hotels\.com|expedia)\b/iu.test(combined)) {
    return false;
  }
  const airbnbConfirmed =
    /\breservation confirmed\b/iu.test(combined) ||
    /\bentire home\b/iu.test(combined) ||
    /\bhosted by\b/iu.test(combined);
  const bookingConfirmed =
    /\byou(?:'|')?re confirmed at\b/iu.test(combined) ||
    /\bconfirmation\s*(?:number|code)\b/iu.test(combined);
  const hasStayCards =
    /\bcheck[\s-]?in\b/iu.test(combined) && /\bcheck[\s-]?out\b/iu.test(combined);
  const itineraryWord = /\bitinerary\b/iu.test(combined);
  const dayPlanBullets = (combined.match(/(?:^|\n)\s*[•\-\*]\s+\S/gu) ?? []).length;
  if (itineraryWord && dayPlanBullets >= 4) return false;
  return (airbnbConfirmed || bookingConfirmed) && hasStayCards && dayPlanBullets < 4;
}

export function stripOtaEmailFooterLines(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => line.length > 0 && !isOtaEmailFooterLine(line));
}

export function stripOtaEmailFooterFromText(text: string): string {
  const cutMarkers = [
    /\n\s*house rules\b/iu,
    /\n\s*cancellation policy\b/iu,
    /\n\s*scheduled payment\b/iu,
    /\n\s*get the app\b/iu,
    /\n\s*airbnb,?\s*inc\./iu,
    /\n\s*update your email preferences\b/iu,
  ];
  let end = text.length;
  for (const marker of cutMarkers) {
    const idx = text.search(marker);
    if (idx >= 0) end = Math.min(end, idx);
  }
  return text.slice(0, end).trim();
}
