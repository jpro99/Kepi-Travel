/**
 * BRI after-train coach — CEO gospel priority (Facts invent=0).
 * Plot lock: bri-after-train-containment.png
 * Post Reg 91312: Aeroporto K.W. → tunnel → ground-floor arrivals → isole A/B+C/D (RdS).
 * NEVER invent: ITA-specific desk, gate numbers, indoor turn-by-turn past tunnel mouth.
 */

export interface BriAirportFactStep {
  id: string;
  title: string;
  detail: string;
}

/** Exact 4-step after-train coach — CEO gospel, post Reg 91312. */
export function buildBriAfterTrainCoachSteps(): BriAirportFactStep[] {
  return [
    {
      id: "bri-aeroporto-kw-stop",
      title: "Bari Aeroporto / Aeroporto K.W. (Ferrotramviaria stop)",
      detail:
        "Your Regionale train ends at the Ferrotramviaria stop inside the airport — Bari Aeroporto / Aeroporto K.W.",
    },
    {
      id: "bri-ferrotramviaria-tunnel",
      title: "~300 m tunnel into arrivals (Ferrotramviaria)",
      detail:
        "Walk the covered passenger tunnel (~300 m, Ferrotramviaria) from the rail stop into the terminal arrivals area. Kepi has no verified indoor geometry past the tunnel mouth.",
    },
    {
      id: "bri-arrivals-ground-floor",
      title: "Ground floor = arrivals",
      detail: "You are on the landside ground-floor arrivals level.",
    },
    {
      id: "bri-check-in-islands",
      title: "Ticket / check-in — isole A/B and C/D (RdS)",
      detail:
        "Ticket and check-in use the single acceptance area on check-in isole A/B and C/D (Regione di Puglia / Aeroporti di Puglia published layout). Kepi does not publish ITA-specific desk location, gate numbers, or indoor turn-by-turn past the tunnel mouth.",
    },
  ];
}
