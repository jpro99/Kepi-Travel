/**
 * G28 / I59 — GetYourGuide “ticket instructions” PDFs are legal terms.
 * The booking ID is on the subject (Booking GYGVN24XVY58). Do not ask
 * anyone to add a Privacy Policy, and do not read REFERENCE as ERENCE.
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
  const labeled = combined.match(/\bbooking\s+([A-Z0-9]{10,16})\b/iu);
  const code = (labeled?.[1] ?? "").toUpperCase();
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
  if (!LEGAL_MARK_RE.test(text)) return false;
  const stripped = stripLegalBoilerplate(text).replace(/---\s*PDF attachment\s*---/giu, "").trim();
  if (stripped.length < 40) return true;
  const hasTourFact =
    /\b(?:meet (?:at|in)|excursion|guided tour|boat tour|check-?in|partenza)\b/iu.test(stripped) &&
    /\b(?:20\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/iu.test(stripped);
  return !hasTourFact;
}

export function extractActivityTicketFacts(text: string, subject = ""): ActivityTicketFacts | null {
  const combined = `${subject}\n${text}`;
  const fromSubject = /\bbooking\s+[A-Z0-9]{10,16}\s+confirmed\b/iu.test(subject);
  if (!isActivityProviderText(combined) && !fromSubject) return null;

  const confirmationCode = extractActivityBookingCode(subject, text);
  const provider = /\bviator\b/iu.test(combined)
    ? "Viator"
    : /\bgetyourguide\b/iu.test(combined) || fromSubject
      ? "GetYourGuide"
      : "";
  if (!confirmationCode && !provider) return null;

  return {
    type: "dinner",
    title: confirmationCode ? `${provider || "Tour"} · ${confirmationCode}` : `${provider || "Tour"} booking`,
    provider,
    confirmationCode,
  };
}
