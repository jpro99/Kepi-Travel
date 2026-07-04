import { extractFlightLegsFromEmailBody } from "@/lib/travelAssistant/emailForwardParser";
import { preparePdfTextForParsing } from "@/lib/travelAssistant/pdfTextExtract";
import {
  buildScannedReservationDraft,
  type ScannedReservationDraft,
} from "@/lib/travelAssistant/scannedReservationDraft";

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
  const knownYears = drafts
    .map((draft) => draft.localTime.trim().slice(0, 4))
    .filter((year) => /^\d{4}$/u.test(year))
    .map((year) => Number.parseInt(year, 10));
  const fallbackYear = knownYears.length > 0 ? Math.max(...knownYears) : null;

  return drafts.map((draft) => {
    if (draft.localTime.trim().length >= 10 || !fallbackYear) {
      return draft;
    }
    const timeOnly = draft.localTime.trim();
    if (/^\d{1,2}:\d{2}$/u.test(timeOnly) && draft.flightDate.trim().length >= 10) {
      return { ...draft, localTime: `${draft.flightDate.trim()} ${timeOnly}` };
    }
    return draft;
  });
}

function isUsableDraft(draft: ScannedReservationDraft): boolean {
  if (draft.localTime.trim().length > 0) return true;
  if (draft.type === "hotel" && draft.checkOutDate.trim().length > 0) return true;
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

/** Merge Claude PDF scan output with regex legs extracted from PDF plain text. */
export function mergeConfirmationDrafts(
  aiDrafts: ScannedReservationDraft[],
  documentText: string,
): ScannedReservationDraft[] {
  const regexDrafts = regexLegsToDrafts(documentText);
  if (regexDrafts.length === 0) {
    return inferMissingYears(aiDrafts.filter(isUsableDraft));
  }

  const nonFlights = aiDrafts.filter((draft) => draft.type !== "flight");
  const aiFlights = aiDrafts.filter((draft) => draft.type === "flight");
  const mergedFlights = new Map<string, ScannedReservationDraft>();

  for (const draft of aiFlights) {
    mergedFlights.set(flightLegKey(draft), draft);
  }
  for (const draft of regexDrafts) {
    const key = flightLegKey(draft);
    const existing = mergedFlights.get(key);
    mergedFlights.set(key, existing ? mergeFlightDraft(existing, draft) : draft);
  }

  const flights =
    aiFlights.length === 0 && regexDrafts.length > 0
      ? regexDrafts
      : [...mergedFlights.values()];

  const combined = inferMissingYears([...flights, ...nonFlights]).filter(isUsableDraft);
  return combined.length > 0 ? combined : inferMissingYears(aiDrafts.filter(isUsableDraft));
}
