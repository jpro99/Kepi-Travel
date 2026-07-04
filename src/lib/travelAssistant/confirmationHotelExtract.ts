import {
  extractBestLocalTimeFromEmailBody,
  prepareEmailBodyForParsing,
} from "@/lib/travelAssistant/emailForwardParser";
import { preparePdfTextForParsing } from "@/lib/travelAssistant/pdfTextExtract";
import {
  buildScannedReservationDraft,
  normalizeScannedDate,
  type ScannedReservationDraft,
} from "@/lib/travelAssistant/scannedReservationDraft";
import { parseCashUsdFromText } from "@/lib/travelAssistant/parseReservationCashUsd";

const HOTEL_CONTEXT_RE =
  /\b(hotel|check-?in|check-?out|property|accommodation|room type|guest room|stay)\b/iu;

const HOTEL_NAME_PATTERNS: RegExp[] = [
  /(?:hotel|property)\s*(?:name)?\s*[:\-]\s*([^\n]{3,80})/iu,
  /(?:reservation at|booking at|thank you for choosing|thank you for booking)\s+([A-Z0-9][^\n]{2,80})/iu,
  /\b((?:Hyatt|Marriott|Hilton|Sheraton|Westin|InterContinental|IHG|Accor|Radisson|Best Western|Holiday Inn)[^\n]{0,70})/iu,
  /\b([A-Z][A-Za-z0-9'&.-]{2,40}\s+(?:Hotel|Resort|Suites|Inn|Lodge|Hostel))\b/u,
];

function extractCheckOutDate(text: string): string {
  const match = text.match(/\bcheck-?out\b[^\n]{0,120}/iu);
  if (!match?.[0]) return "";
  const dateMatch =
    match[0].match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/iu) ??
    match[0].match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/u) ??
    match[0].match(/\b(20\d{2}-\d{2}-\d{2})\b/u);
  return dateMatch?.[1] ? normalizeScannedDate(dateMatch[1]) : "";
}

function extractHotelLocation(text: string): string {
  const cityMatch = text.match(/\b(?:city|location|address)\s*[:\-]\s*([^\n]{3,80})/iu);
  if (cityMatch?.[1]) {
    return cityMatch[1].trim().split(/\s{2,}/u)[0]?.trim() ?? "";
  }
  const commaCity = text.match(/\b([A-Z][A-Za-z .'-]{2,40},\s*[A-Z][A-Za-z .'-]{2,40})\b/u);
  return commaCity?.[1]?.trim() ?? "";
}

function extractHotelName(text: string): string {
  for (const pattern of HOTEL_NAME_PATTERNS) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.trim().replace(/\s+/gu, " ");
    if (candidate && candidate.length >= 3) {
      return candidate.split(/\|/u)[0]?.trim() ?? candidate;
    }
  }
  return "";
}

function extractConfirmationCode(text: string): string {
  const match = text.match(
    /(?:confirmation(?:\s*(?:number|code|#))?|booking\s*(?:ref(?:erence)?|code|#)|reservation\s*(?:number|#)?)\s*[:\-#]?\s*([A-Z0-9-]{4,20})/iu,
  );
  return match?.[1]?.trim().toUpperCase() ?? "";
}

/** Regex hotel extraction for text/html/pdf confirmations (no AI required). */
export function extractHotelDraftsFromDocumentText(documentText: string): ScannedReservationDraft[] {
  const prepared = preparePdfTextForParsing(documentText);
  if (!HOTEL_CONTEXT_RE.test(prepared)) {
    return [];
  }

  const lineAware = prepareEmailBodyForParsing(prepared).lineAware;
  const hotelName = extractHotelName(lineAware);
  const localTime = extractBestLocalTimeFromEmailBody(lineAware, "hotel") ?? "";
  const checkOutDate = extractCheckOutDate(lineAware);
  const location = extractHotelLocation(lineAware);
  const confirmationCode = extractConfirmationCode(lineAware);

  if (!hotelName && !localTime && !checkOutDate && !confirmationCode) {
    return [];
  }

  const title = hotelName || "Hotel stay";
  const provider = hotelName.split(/\s+/u).slice(0, 2).join(" ") || "Hotel";
  const quotedPriceUsd = parseCashUsdFromText(lineAware);

  return [
    buildScannedReservationDraft({
      type: "hotel",
      title,
      provider,
      localTime,
      location,
      confirmationCode,
      checkOutDate,
      cashUsd: quotedPriceUsd,
    }),
  ];
}
