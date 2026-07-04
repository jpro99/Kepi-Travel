export type TripFirstVariant = "general" | "hotel" | "flight";

export function buildTripFirstHeadline(): string {
  return "Book where it's cheapest — Kepi runs the trip after";
}

export function buildTripFirstBody(variant: TripFirstVariant = "general"): string {
  switch (variant) {
    case "hotel":
      return "Compare on Google or Booking.com for the best rate. After you book, forward your confirmation email to Kepi and it appears on your timeline with check-in guidance and alerts.";
    case "flight":
      return "Compare cash and award options here. Book on Google Flights, the airline, or Seats.aero — then forward your confirmation so Kepi tracks gates, delays, and connections.";
    default:
      return "Plan in Kepi, book on Google, airlines, or Booking.com, then forward confirmations. Kepi walks you through the whole trip — timeline, alerts, gaps, and check-in.";
  }
}

/** @deprecated Use buildTripFirstHeadline + buildTripFirstBody('hotel') */
export function buildHotelTripFirstBannerCopy(): { headline: string; body: string } {
  return {
    headline: buildTripFirstHeadline(),
    body: buildTripFirstBody("hotel"),
  };
}

export function buildForwardAfterBookHint(): string {
  return "After you book, forward the confirmation email to your Kepi address — it appears on your timeline automatically.";
}

export function buildFlightCashBookLabel(input: {
  airlineName: string;
  priceUsd: number;
}): string {
  const airline = input.airlineName.split(/\s+/)[0] || "Airline";
  return `Book on ${airline} or Google · $${Math.round(input.priceUsd)} ↗`;
}

export function buildFlightAwardBookLabel(program: string): string {
  return `Verify on Seats.aero · book ${program} ↗`;
}
