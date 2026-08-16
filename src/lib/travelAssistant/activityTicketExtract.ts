/**
 * G28 / I59 / G29 — Activity provider emails (GetYourGuide, Viator).
 * Ticket-instructions PDFs and ticket-link forwards are not bookings.
 * Read booking IDs from the subject; never show tracking URLs or parser jargon.
 */

export interface ActivityTicketFacts {
  type: "dinner";
  title: string;
  provider: string;
  confirmationCode: string;
}

const ACTIVITY_PROVIDER_RE = /\b(?:getyourguide|viator|airbnb experience)\b/iu;
const LEGAL_HEADING_RE =
  /\n\s*(?:legal notice|privacy policy|general terms and conditions|terms and conditions|data protection)\b/iu;
const LEGAL_MARK_RE =
  /\b(?:legal notice|privacy policy|general terms and conditions|terms and conditions)\b/iu;
const GARBAGE_CONFIRMATION = new Set([
  "ERENCE",
  "REFERENCE",
  "REFERENC",
  "INSTRUCTIONS",
  "NOTICE",
  "PRIVACY",
  "POLICY",
  "LEGAL",
  "TERMS",
  "CONDITIONS",
  "GENERAL",
  "TICKET",
  "BOOKING",
  "CONFIRMED",
  "CONFIRMATION",
]);

const GARBAGE_TITLE_RE =
  /^(?:pickup for (?:your )?tour|get your tickets|visit our help|confirmed|booking|ticket instructions|damage)$/iu;

const GARBAGE_LOCATION_RE =
  /^(?:pickup for (?:your )?tour|get your tickets|visit our help|https?:\/\/)/iu;

export function isGarbageConfirmationCode(raw: string): boolean {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (!code) return true;
  if (GARBAGE_CONFIRMATION.has(code)) return true;
  if (code.length < 6) return true;
  if (!/\d/u.test(code) && code.length < 8) return true;
  return false;
}

export function extractActivityBookingCode(subject: string, text = ""): string {
  const combined = `${subject}\n${text}`;
  const viator = combined.match(/\bviator\s+booking\s+(\d{6,14})\b/iu);
  const gyg = combined.match(/\bbooking\s+([A-Z0-9]{10,16})\b/iu);
  const code = (viator?.[1] ?? gyg?.[1] ?? "").toUpperCase();
  if (code && !isGarbageConfirmationCode(code)) return code;
  return "";
}

export function isActivityProviderText(text: string): boolean {
  return ACTIVITY_PROVIDER_RE.test(text);
}

export function stripLegalBoilerplate(text: string): string {
  const cut = text.search(LEGAL_HEADING_RE);
  if (cut < 0) return text.trim();
  return text.slice(0, cut).trim();
}

export function isLegalBoilerplateText(text: string): boolean {
  if (!LEGAL_MARK_RE.test(text) && !/\bticket instructions\b/iu.test(text)) return false;
  const stripped = stripLegalBoilerplate(text).replace(/---\s*PDF attachment\s*---/giu, "").trim();
  if (stripped.length < 80) return true;
  const hasTourFact =
    /\b(?:meet (?:at|in)|excursion|guided tour|boat tour|check-?in|partenza)\b/iu.test(stripped) &&
    /\b(?:20\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/iu.test(stripped);
  return !hasTourFact;
}

/** Viator "Get your tickets" + MptUrl tracking link — not an importable booking. */
export function isActivityLinkStubText(text: string): boolean {
  if (!/\b(?:viator\.com|getyourguide\.com)\b/iu.test(text)) return false;
  const withoutUrls = text
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/\[image:[^\]]+\]/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const hasTourFact =
    /\b(?:meet (?:at|in)|excursion|guided tour|boat tour)\b/iu.test(withoutUrls) &&
    /\b(?:20\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2})/iu.test(withoutUrls);
  return !hasTourFact;
}

export function isTicketInstructionsLeftover(subject: string, text = ""): boolean {
  const combined = `${subject}\n${text}`;
  if (/\bticket instructions\b/iu.test(subject) && extractActivityBookingCode(subject, text)) {
    return true;
  }
  return isLegalBoilerplateText(combined);
}

export function isActivityNotificationLeftover(subject: string, text = ""): boolean {
  return isTicketInstructionsLeftover(subject, text) || isActivityLinkStubText(`${subject}\n${text}`);
}

export function isGarbageLeftoverTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  if (/^fwd:/iu.test(trimmed)) return true;
  if (GARBAGE_TITLE_RE.test(trimmed)) return true;
  return false;
}

export function isGarbageLeftoverLocation(location: string): boolean {
  const trimmed = location.trim();
  if (!trimmed) return true;
  if (GARBAGE_LOCATION_RE.test(trimmed)) return true;
  if (/\b(?:you may|create an? account|social media|privacy policy|terms and conditions)\b/iu.test(trimmed)) {
    return true;
  }
  if (trimmed.split(/\s+/u).length >= 8) return true;
  return false;
}

export function formatActivitySourceForDisplay(text: string): string | null {
  if (!text.trim()) return null;
  if (isActivityLinkStubText(text)) return null;
  let body = stripLegalBoilerplate(text);
  body = body.replace(/https?:\/\/\S+/giu, "").replace(/\[image:[^\]]+\]/giu, "");
  body = body.replace(/\s+/gu, " ").trim();
  if (body.length < 12) return null;
  return body.slice(0, 320);
}

export function extractActivityTicketFacts(text: string, subject = ""): ActivityTicketFacts | null {
  const combined = `${subject}\n${text}`;
  const fromSubject =
    /\bbooking\s+[A-Z0-9]{10,16}\s+confirmed\b/iu.test(subject) ||
    /\bviator\s+booking\s+\d{6,14}\b/iu.test(subject);
  if (!isActivityProviderText(combined) && !fromSubject) return null;

  const confirmationCode = extractActivityBookingCode(subject, text);
  const provider = /\bviator\b/iu.test(combined)
    ? "Viator"
    : /\bgetyourguide\b/iu.test(combined) || fromSubject
      ? "GetYourGuide"
      : "";
  if (!confirmationCode && !provider) return null;

  const title = confirmationCode
    ? `${provider || "Tour"} · ${confirmationCode}`
    : `${provider || "Tour"} booking`;

  return {
    type: "dinner",
    title,
    provider,
    confirmationCode,
  };
}
