"use client";

import { TravelFitEarnBar } from "@/components/travelAssistant/TravelFitEarnBar";
import type { TravelFitReservationInput } from "@/components/travelAssistant/TravelFitCard";

interface BookTravelFitStripProps {
  reservations: TravelFitReservationInput[];
  bookSubTab: "flights" | "hotels";
}

export function BookTravelFitStrip({ reservations, bookSubTab }: BookTravelFitStripProps) {
  const filtered = reservations.filter((r) => r.type === (bookSubTab === "flights" ? "flight" : "hotel"));
  if (filtered.length === 0) return null;
  return <TravelFitEarnBar reservations={filtered} />;
}
