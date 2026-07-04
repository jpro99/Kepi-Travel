import { extractFlightLegsFromEmailBody } from "@/lib/travelAssistant/emailForwardParser";
import { extractHotelDraftsFromDocumentText } from "@/lib/travelAssistant/confirmationHotelExtract";
import { preparePdfTextForParsing } from "@/lib/travelAssistant/pdfTextExtract";
import { parseCashUsdNearBooking } from "@/lib/travelAssistant/parseReservationCashUsd";
import {
  buildScannedReservationDraft,
  type ScannedReservationDraft,
} from "@/lib/travelAssistant/scannedReservationDraft";
import { correctReservationTravelDates } from "@/lib/travelAssistant/travelDateCorrection";

function normalizeFlightNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/gu, "");
}

function flightLegKey(draft: ScannedReservationDraft): string {
  const fn = normalizeFlightNumber(draft.flightNumber);
  const dep = draft.flightDepartureAirport.trim().toUpperCase();
  const arr = draft.flightArrivalAirport.trim().toUpperCase();
  if (fn) return `${fn}:${dep}:${arr}`;
  if (dep && arr) return `${dep}:${arr}:${draft.localTime.trim()}`;
  return draft.title.trim().toLowerCase();
}

function mergeFlightDraft(
  primary: ScannedReservationDraft,
  secondary: ScannedReservationDraft,
): ScannedReservationDraft {
  return {
    ...primary,
    title: primary.title.trim() || secondary.title,
    provider: primary.provider.trim() || secondary.provider,
    localTime: primary.localTime.trim() || secondary.localTime,
    timezone: primary.timezone.trim() && primary.timezone !== "Etc/UTC" ? primary.timezone : secondary.timezone,
    location: primary.location.trim() || secondary.location,
    confirmationCode: primary.confirmationCode.trim() || secondary.confirmationCode,
    notes: primary.notes.trim() || secondary.notes,
    flightNumber: primary.flightNumber.trim() || secondary.flightNumber,
    flightAirline: primary.flightAirline.trim() || secondary.flightAirline,
    flightDate: primary.flightDate.trim() || secondary.flightDate,
    flightDepartureAirport: primary.flightDepartureAirport.trim() || secondary.flightDepartureAirport,
    flightArrivalAirport: primary.flightArrivalAirport.trim() || secondary.flightArrivalAirport,
    quotedPriceUsd: primary.quotedPriceUsd ?? secondary.quotedPriceUsd,
  };
}

function regexLegsToDrafts(documentText: string): ScannedReservationDraft[] {
  const prepared = preparePdfTextForParsing(documentText);
  return extractFlightLegsFromEmailBody(prepared).map((leg) => {
    const flightNumber = leg.flightNumber.trim();
    const dep = leg.departureAirport.trim().toUpperCase();
    const arr = leg.arrivalAirport.trim().toUpperCase();
    return buildScannedReservationDraft({
      type: "flight",
      flightNumber,
      departureAirport: dep,
      arrivalAirport: arr,
      localTime: leg.localTime,
      title: flightNumber && dep && arr ? `${flightNumber} ${dep} → ${arr}` : flightNumber || "Flight",
      provider: flightNumber.replace(/[0-9]/gu, "").trim() || "Airline",
    });
  });
}

function inferMissingYears(drafts: ScannedReservationDraft[]): ScannedReservationDraft[] {
  return drafts.map((draft) => {
    const timeOnly = draft.localTime.trim();
    if (/^\d{1,2}:\d{2}$/u.test(timeOnly) && draft.flightDate.trim().length >= 10) {
      return { ...draft, localTime: `${draft.flightDate.trim()} ${timeOnly}` };
    }
    return draft;
  });
}

function applyTravelDateCorrections(
  drafts: ScannedReservationDraft[],
  referenceDate = new Date(),
): ScannedReservationDraft[] {
  return drafts.map((draft) => correctReservationTravelDates(draft, referenceDate));
}

function enrichDraftsWithDocumentPricing(
  drafts: ScannedReservationDraft[],
  documentText: string,
): ScannedReservationDraft[] {
  if (!documentText.trim()) return drafts;
  return drafts.map((draft) => {
    if (draft.quotedPriceUsd != null && draft.quotedPriceUsd > 0) return draft;
    const parsed = parseCashUsdNearBooking(documentText, {
      confirmationCode: draft.confirmationCode,
      title: draft.title,
    });
    if (parsed == null || parsed <= 0) return draft;
    return { ...draft, quotedPriceUsd: parsed };
  });
}

function isUsableDraft(draft: ScannedReservationDraft): boolean {
  if (draft.localTime.trim().length > 0) return true;
  if (draft.type === "hotel" && draft.checkOutDate.trim().length > 0) return true;
  if (draft.type === "hotel" && draft.title.trim().length > 0 && draft.confirmationCode.trim().length > 0) {
    return true;
  }
  if (
    draft.type === "flight" &&
    draft.flightNumber.trim() &&
    draft.flightDepartureAirport.trim() &&
    draft.flightArrivalAirport.trim()
  ) {
    return true;
  }
  return false;
}

export interface MergeConfirmationDraftsOptions {
  /** For tests; defaults to now so past-year imports roll forward automatically. */
  referenceDate?: Date;
}

/** Merge Claude PDF scan output with regex legs extracted from PDF plain text. */
export function mergeConfirmationDrafts(
  aiDrafts: ScannedReservationDraft[],
  documentText: string,
  options?: MergeConfirmationDraftsOptions,
): ScannedReservationDraft[] {
  const referenceDate = options?.referenceDate ?? new Date();
  const regexFlightDrafts = regexLegsToDrafts(documentText);
  const regexHotelDrafts = extractHotelDraftsFromDocumentText(documentText);

  if (regexFlightDrafts.length === 0 && regexHotelDrafts.length === 0) {
    return enrichDraftsWithDocumentPricing(
      applyTravelDateCorrections(inferMissingYears(aiDrafts.filter(isUsableDraft)), referenceDate),
      documentText,
    );
  }

  const nonFlights = aiDrafts.filter((draft) => draft.type !== "flight");
  const aiFlights = aiDrafts.filter((draft) => draft.type === "flight");
  const mergedFlights = new Map<string, ScannedReservationDraft>();

  for (const draft of aiFlights) {
    mergedFlights.set(flightLegKey(draft), draft);
  }
  for (const draft of regexFlightDrafts) {
    const key = flightLegKey(draft);
    const existing = mergedFlights.get(key);
    mergedFlights.set(key, existing ? mergeFlightDraft(existing, draft) : draft);
  }

  const flights =
    aiFlights.length === 0 && regexFlightDrafts.length > 0
      ? regexFlightDrafts
      : [...mergedFlights.values()];

  const aiHotels = nonFlights.filter((draft) => draft.type === "hotel");
  const hotels =
    aiHotels.length === 0 && regexHotelDrafts.length > 0
      ? regexHotelDrafts
      : [...regexHotelDrafts, ...aiHotels];
  const otherNonFlights = nonFlights.filter((draft) => draft.type !== "hotel");

  const combined = applyTravelDateCorrections(
    enrichDraftsWithDocumentPricing(
      inferMissingYears([...flights, ...hotels, ...otherNonFlights]),
      documentText,
    ),
    referenceDate,
  ).filter(isUsableDraft);
  return combined.length > 0
    ? combined
    : enrichDraftsWithDocumentPricing(
        applyTravelDateCorrections(inferMissingYears(aiDrafts.filter(isUsableDraft)), referenceDate),
        documentText,
      );
}
