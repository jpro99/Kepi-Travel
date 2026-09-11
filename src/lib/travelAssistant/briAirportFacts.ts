/**
 * BRI (Bari Karol Wojtyła) after-train coach — CEO cartographer containment lock (invent=0).
 * Plot: bri-after-train-containment.png — Aeroporto KW → tunnel → arrivals → check-in isole.
 * No ITA desk, gates, or indoor turns past the tunnel mouth.
 */

export interface BriAirportFactStep {
  id: string;
  title: string;
  detail: string;
}

/**
 * Exact post–Reg 91312 coach wired from CEO containment plot.
 * TEXT sources: Ferrotramviaria tunnel; SEA/Aeroporti di Puglia check-in isole A/B + C/D.
 */
export function buildBriAfterTrainCoachSteps(): BriAirportFactStep[] {
  return [
    {
      id: "bri-aeroporto-kw-stop",
      title: "Aeroporto Karol Wojtyła rail stop",
      detail:
        "Your Regionale train ends at Aeroporto K.W. (Bari Aeroporto Karol Wojtyła station). Follow signs for the passenger walkway to the terminal.",
    },
    {
      id: "bri-ferrotramviaria-tunnel",
      title: "300 m tunnel to terminal (Ferrotramviaria — official TEXT)",
      detail:
        "Walk the covered passenger tunnel (~300 m) from the rail stop to the terminal building. Operated by Ferrotramviaria. Kepi has no verified indoor geometry past the tunnel mouth.",
    },
    {
      id: "bri-arrivals-ground-floor",
      title: "Arrivals — ground floor (landside)",
      detail:
        "You enter the landside ground-floor arrivals hall (baggage claim / arrivals level per published airport layout).",
    },
    {
      id: "bri-check-in-islands",
      title: "Check-in isole A/B and C/D",
      detail:
        "Departures check-in counters are on check-in islands A/B and C/D (Aeroporti di Puglia published layout). Follow airport signage — Kepi does not publish ITA desk location, gate assignments, or indoor turn-by-turn past here.",
    },
  ];
}
