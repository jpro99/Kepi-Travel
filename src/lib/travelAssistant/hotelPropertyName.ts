/**
 * Client-safe hotel property name extraction from confirmation copy (I25).
 * Kept separate from emailForwardParser so UI can salvage names without pulling server-only deps.
 */

const OTA_TITLE_DENYLIST =
  /^(booking\.com|booking|expedia|hotels\.com|airbnb|vrbo|agoda|trip\.com|priceline|kayak)$/iu;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function cleanHotelPropertyCapture(raw: string): string | null {
  const cleaned = normalizeWhitespace(raw)
    .replace(
      /\s+(?:check[- ]?in|check[- ]?out|confirmation|booking\s*(?:number|ref|code)|from\s+\d|until\s+\d).*$/iu,
      "",
    )
    .replace(/\s+confirmation.*$/iu, "")
    .replace(/\s+[-–].*$/u, "")
    .trim();
  if (cleaned.length < 3 || cleaned.length > 80) return null;
  if (OTA_TITLE_DENYLIST.test(cleaned)) return null;
  if (/^(your|the|a|an)\s/i.test(cleaned) && cleaned.split(/\s+/).length < 3) return null;
  return cleaned;
}

/**
 * Pull the property name from Booking.com / OTA / hotel confirmation copy.
 * Prefer "You're confirmed at Casa de Elena" over the OTA brand as title (I25).
 */
export function extractHotelPropertyName(subject: string, body: string): string | null {
  const combined = `${subject}\n${body}`;
  const patterns: RegExp[] = [
    // Stop at check-in/check-out even when the email body was collapsed to one line.
    /(?:you(?:'re| are)\s+)?confirmed\s+at\s+(.+?)(?=\s*(?:check[- ]?in|check[- ]?out|confirmation|\n|$))/iu,
    /(?:you(?:'re| are)\s+)?(?:staying|booked)\s+at\s+(.+?)(?=\s*(?:check[- ]?in|check[- ]?out|confirmation|\n|$))/iu,
    /(?:reservation|booking)\s+confirmed\s+at\s+(.+?)(?=\s*(?:check[- ]?in|check[- ]?out|confirmation|\n|$))/iu,
    /(?:hotel|property|accommodation)\s*name\s*[:\-]\s*([^\n]{3,80})/iu,
    /(?:hotel|property|stay at|accommodation)\s*[:\-]?\s*([A-Z][A-Za-z0-9 '&.-]{2,60})/iu,
  ];
  for (const pattern of patterns) {
    const match = combined.match(pattern);
    const cleaned = match?.[1] ? cleanHotelPropertyCapture(match[1]) : null;
    if (cleaned) return cleaned;
  }
  // Subject: "Confirmed: Casa de Elena" / "Your booking at Casa de Elena"
  const subjectMatch = subject.match(
    /(?:confirmed|booking|reservation|stay)(?:\s+at)?\s*[:\-]\s*([A-Z][^\n.!?]{2,70})/iu,
  );
  if (subjectMatch?.[1]) {
    const cleaned = cleanHotelPropertyCapture(subjectMatch[1]);
    if (cleaned) return cleaned;
  }
  return null;
}
