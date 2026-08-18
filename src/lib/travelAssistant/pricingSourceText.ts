import { parseAwardMilesPlusCashFromText } from "@/lib/travelAssistant/parseAwardMilesPlusCash";
import {
  extractNearBookingText,
  parseCashUsdFromText,
  type CashUsdResolvable,
} from "@/lib/travelAssistant/parseReservationCashUsd";

export interface PricingSourceHints extends CashUsdResolvable {
  confirmationCode?: string;
  title?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
}

/** Best email slice for pricing — trip-level award totals need the full confirmation. */
export function selectPricingSourceText(input: PricingSourceHints): string {
  const combined = [input.notes, input.originalEmailText].filter(Boolean).join("\n").trim();
  if (!combined) return "";

  if (parseAwardMilesPlusCashFromText(combined)) {
    return combined;
  }

  const nearText = extractNearBookingText(combined, {
    confirmationCode: input.confirmationCode,
    title: input.title,
    flightNumber: input.flightNumber,
    departureAirport: input.flightDepartureAirport,
    arrivalAirport: input.flightArrivalAirport,
  });

  if (nearText) {
    if (parseAwardMilesPlusCashFromText(nearText)) return combined;
    const nearCash = parseCashUsdFromText(nearText);
    if (nearCash != null) return nearText;
  }

  return combined;
}
