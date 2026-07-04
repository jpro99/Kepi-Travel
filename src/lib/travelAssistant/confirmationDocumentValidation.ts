const FLIGHT_NUMBER_SIGNAL = /\b(?:Flight\s*)?[A-Z]{2}\s*\d{1,4}\b/u;

const TRAVEL_KEYWORD_SIGNAL =
  /\b(?:flight|departure|arrival|itinerary|confirmation(?:\s+code)?|record\s+locator|boarding|check-?in|check-?out|operated\s+by|passenger|hotel|property|accommodation|room|suite|stay)\b/iu;

const TRAVEL_DATE_TIME_SIGNAL =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}(?:\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM))?/iu;

const AIRPORT_ROUTE_SIGNAL = /\([A-Z]{3}\)|\b[A-Z]{3}\s*(?:->|→|—|–|-)\s*[A-Z]{3}\b/u;

const MISLEADING_PAGE_RULES: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /sign\s+in\s+to\s+continue\s+to\s+google\s+drive/iu,
    message:
      "This file is a Google Drive sign-in page, not your itinerary. Open your confirmation email in Gmail, choose Print → Save as PDF, or forward the email to your Kepi trip address.",
  },
  {
    pattern: /google\s+drive:\s*sign-?in/iu,
    message:
      "This file is a Google Drive login page, not a travel confirmation. Download the real PDF from your email app or forward the confirmation to Kepi.",
  },
  {
    pattern: /\bforgot\s+email\b.*\bcreate\s+account\b/iu,
    message:
      "This looks like a web login page, not a travel confirmation. Save the itinerary PDF from your airline email instead.",
  },
];

export function hasTravelConfirmationSignals(plainText: string): boolean {
  const text = plainText.trim();
  if (text.length < 40) return false;
  if (FLIGHT_NUMBER_SIGNAL.test(text)) return true;
  if (/\b(?:hotel|check-?in|check-?out|property|accommodation)\b/iu.test(text)) return true;
  if (TRAVEL_DATE_TIME_SIGNAL.test(text) && TRAVEL_KEYWORD_SIGNAL.test(text)) return true;
  if (AIRPORT_ROUTE_SIGNAL.test(text) && TRAVEL_KEYWORD_SIGNAL.test(text)) return true;
  return false;
}

export function detectMisleadingDownloadPage(plainText: string): string | null {
  const text = plainText.trim();
  if (text.length === 0) return null;
  for (const rule of MISLEADING_PAGE_RULES) {
    if (rule.pattern.test(text)) {
      return rule.message;
    }
  }
  return null;
}

export function validateConfirmationPlainText(
  plainText: string,
): { ok: true } | { ok: false; message: string } {
  const misleading = detectMisleadingDownloadPage(plainText);
  if (misleading) {
    return { ok: false, message: misleading };
  }
  if (plainText.trim().length < 40) {
    return {
      ok: false,
      message: "This file has too little readable text. Try a PDF export from your airline email or a screenshot of the confirmation.",
    };
  }
  if (!hasTravelConfirmationSignals(plainText)) {
    return {
      ok: false,
      message:
        "Could not find flight or hotel details in this file. Make sure you uploaded your itinerary — not a login page or blank export.",
    };
  }
  return { ok: true };
}
