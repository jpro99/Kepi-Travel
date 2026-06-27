"use client";

import { useEffect, useState } from "react";
import { EarnStackHint } from "@/components/travelAssistant/EarnStackHint";
import type { EarnStackSuggestion } from "@/lib/travelFit/types";
import type { TravelFitReservationInput } from "@/components/travelAssistant/TravelFitCard";

export function TravelFitEarnBar({ reservations }: { reservations: TravelFitReservationInput[] }) {
  const [stack, setStack] = useState<EarnStackSuggestion | null>(null);

  useEffect(() => {
    if (reservations.length === 0) return;
    let cancelled = false;
    void fetch("/api/travel-fit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservations }),
    })
      .then((r) => r.json())
      .then((data: { report?: { earnStackPreview: EarnStackSuggestion | null } }) => {
        if (!cancelled) setStack(data.report?.earnStackPreview ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reservations]);

  return <EarnStackHint stack={stack} />;
}
