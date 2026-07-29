import {
  extractBestLocalTimeFromEmailBody,
  prepareEmailBodyForParsing,
} from "@/lib/travelAssistant/emailForwardParser";
import {
  extractHotelAddressLocation,
  extractLabeledHotelStayDates,
} from "@/lib/travelAssistant/hotelStayDateExtract";
import { preparePdfTextForParsing } from "@/lib/travelAssistant/pdfTextExtract";
import {
  buildScannedReservationDraft,
  normalizeScannedDate,
  type ScannedReservationDraft,
} from "@/lib/travelAssistant/scannedReservationDraft";
import { parseCashUsdFromText } from "@/lib/travelAssistant/parseReservationCashUsd";

const HOTEL_CONTEXT_RE =
  /\b(hotel|check-?in|check-?out|property|accommodation|room type|guest room|stay|entire home|airbnb|vrbo)\b/iu;

const HOTEL_NAME_PATTERNS: RegExp[] = [
  /(?:hotel|property)\s*(?:name)?\s*[:\-]\s*([^\n]{3,80})/iu,
  /(?:you'?re confirmed at|confirmed at|reservation at|booking at|thank you for choosing|thank you for booking)\s+([A-Z0-9][^\n]{2,80})/iu,
  /\b((?:Hyatt|Marriott|Hilton|Sheraton|Westin|InterContinental|IHG|Accor|Radisson|Best Western|Holiday Inn)[^\n]{0,70})/iu,
  /\b([A-Z][A-Za-z0-9'&.-]{2,40}\s+(?:Hotel|Resort|Suites|Inn|Lodge|Hostel|Apartment))\b/u,
  // Named B&B / boutique properties without Hotel suffix (Booking.com "NEREA Monopoli")
  /\bat\s+([A-Z][A-Z0-9'&.-]{2,40}(?:\s+[A-Z][A-Za-z0-9'&.-]{2,40}){0,3})\b/u,
];

function extractCheckOutDate(text: string): string {
  // Prefer labeled Airbnb/Booking cards (yearless or yearful).
  const labeled = extractLabeledHotelStayDates(text);
  if (labeled?.checkOutDate) return labeled.checkOutDate;

  // Booking.com often puts the date on the next line: "Check-out\nTuesday, September 8, 2026"
  const match =
    text.match(/\bcheck[\s-]?out\b[:\s]*\n?\s*([^\n]{3,80})/iu) ??
    text.match(/\bcheck[\s-]?out\b[^\n]{0,120}/iu);
  if (!match) return "";
  const window = (match[1] ?? match[0] ?? "").replace(
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+/iu,
    "",
  );
  const dateMatch =
    window.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/iu) ??
    window.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/u) ??
    window.match(/\b(20\d{2}-\d{2}-\d{2})\b/u) ??
    window.match(/\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/u);
  return dateMatch?.[1] ? normalizeScannedDate(dateMatch[1]) : "";
}

function extractHotelLocation(text: string): string {
  const fromAddress = extractHotelAddressLocation(text);
  if (fromAddress) return fromAddress;
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
  // Airbnb subject-style first line after "Reservation confirmed"
  const airbnbTitle = text.match(
    /Reservation confirmed\s*\n\s*([A-Z][^\n]{2,80})/iu,
  )?.[1]?.trim();
  if (airbnbTitle && !/^(check-?in|check-?out|address|guests)/iu.test(airbnbTitle)) {
    return airbnbTitle;
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
  const labeled = extractLabeledHotelStayDates(lineAware);
  const localTime =
    labeled?.checkInLocalTime ||
    extractBestLocalTimeFromEmailBody(lineAware, "hotel") ||
    "";
  const checkOutDate = labeled?.checkOutDate || extractCheckOutDate(lineAware);
  const location = extractHotelLocation(lineAware);
  const confirmationCode = extractConfirmationCode(lineAware);

  if (!hotelName && !localTime && !checkOutDate && !confirmationCode) {
    return [];
  }

  const title = hotelName || "Hotel stay";
  const provider =
    /\bairbnb\b/iu.test(lineAware) || /\bhosted by\b/iu.test(lineAware)
      ? "Airbnb"
      : hotelName.split(/\s+/u).slice(0, 2).join(" ") || "Hotel";
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
