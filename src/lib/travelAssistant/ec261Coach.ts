/**
 * EC 261 / EU Regulation 261/2004 coach — official text only.
 * Amounts and rights cite Regulation (EC) No 261/2004 (EUR-Lex CELEX:32004R0261).
 * Kepi coaches; it does not file claims.
 */

import type { StrandedDisruptionReason } from "@/lib/travelAssistant/strandedFlightDetector";

/** Official EUR-Lex consolidated text — sole source for compensation bands. */
export const EC261_REGULATION_URL =
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004R0261";

/** European Commission — Your Europe passenger rights hub. */
export const EC261_YOUR_EUROPE_URL =
  "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm";

/** EU list of national enforcement bodies (European Commission). */
export const EC261_ENFORCEMENT_BODIES_URL =
  "https://transport.ec.europa.eu/transport-themes/passenger-rights/complaint-handling-bodies_en";

/**
 * EU Parliament / Commission political agreement on air passenger rights reform —
 * not yet in force as of 2026-09-06. Cite separately; do not replace Article 7 sums.
 */
export const EC261_REFORM_AGREEMENT_URL =
  "https://www.europarl.europa.eu/news/en/press-room/20250711IPR28212/air-passenger-rights-meps-and-council-reach-deal-on-stronger-rights";

export const EC261_REFORM_STATUS_AS_OF = "2026-09-06";

export type Ec261DistanceBand = "short" | "medium" | "long" | "unknown";

export interface Ec261CompensationBand {
  band: Ec261DistanceBand;
  distanceLabel: string;
  /** Article 7(1) fixed sums — never invent; cite regulation. */
  amountEur: number | null;
  articleRef: string;
}

/**
 * Article 7(1) compensation bands (Regulation (EC) No 261/2004).
 * Distance is great-circle route per Article 7(4) — user/airline must measure;
 * we show bands with official amounts only.
 */
export const EC261_ARTICLE_7_BANDS: readonly Ec261CompensationBand[] = [
  {
    band: "short",
    distanceLabel: "1 500 km or less",
    amountEur: 250,
    articleRef: "Article 7(1)(a)",
  },
  {
    band: "medium",
    distanceLabel: "Intra-Community over 1 500 km, or other 1 500–3 500 km",
    amountEur: 400,
    articleRef: "Article 7(1)(b)",
  },
  {
    band: "long",
    distanceLabel: "Over 3 500 km (not intra-Community)",
    amountEur: 600,
    articleRef: "Article 7(1)(c)",
  },
];

export interface Ec261CoachStep {
  id: string;
  title: string;
  detail: string;
  officialUrl?: string;
  officialLabel?: string;
}

export interface Ec261ReformNotice {
  statusAsOf: string;
  summary: string;
  officialUrl: string;
}

export interface Ec261CoachContent {
  eligible: boolean;
  headline: string;
  intro: string;
  compensationBands: readonly Ec261CompensationBand[];
  careSummary: string;
  extraordinaryCircumstances: string;
  reformNotice: Ec261ReformNotice | null;
  steps: Ec261CoachStep[];
  checklist: readonly string[];
  disclaimer: string;
}

function careSummaryForReason(reason: StrandedDisruptionReason): string {
  if (reason === "denied-boarding" || reason === "overbook") {
    return "Under Articles 8–9, the operating carrier must choose between reimbursement/refund and re-routing, and provide care (meals, refreshments, communication, and hotel when an overnight stay becomes necessary) while you wait.";
  }
  if (reason === "cancel") {
    return "Under Articles 5 and 8–9, when a flight is cancelled you may have rights to re-routing or reimbursement and to care (meals, refreshments, hotel, transport) depending on delay and notice.";
  }
  if (reason === "delay") {
    return "Under Article 6, for long delays the carrier must provide care (meals, refreshments, communication, and hotel when needed). Compensation under Article 7 may apply if arrival is delayed beyond thresholds in Article 7(1) — unless extraordinary circumstances apply (Article 5(3)).";
  }
  return "Rights depend on whether you were denied boarding, the flight was cancelled, or arrival was delayed beyond the thresholds in Article 7. Extraordinary circumstances (Article 5(3)) can limit compensation.";
}

export function buildEc261ReformNotice(nowIso = new Date().toISOString()): Ec261ReformNotice {
  const asOf = nowIso.slice(0, 10);
  return {
    statusAsOf: asOf,
    summary:
      `As of ${asOf}, the July 2026 European Parliament–Council political agreement on stronger air passenger rights is not yet EU law. Today’s fixed compensation sums still come from Article 7(1) of Regulation (EC) No 261/2004 — Kepi does not quote future reform amounts.`,
    officialUrl: EC261_REFORM_AGREEMENT_URL,
  };
}

export function buildEc261CoachContent(reason: StrandedDisruptionReason): Ec261CoachContent {
  const eligible =
    reason === "overbook" ||
    reason === "denied-boarding" ||
    reason === "cancel" ||
    reason === "delay";

  const headline =
    reason === "overbook" || reason === "denied-boarding"
      ? "You may have rights under EU Regulation 261/2004"
      : reason === "cancel"
        ? "Cancelled flight — EU passenger rights"
        : reason === "delay"
          ? "Long delay — care and possible compensation"
          : "EU air passenger rights (Regulation 261/2004)";

  const steps: Ec261CoachStep[] = [
    {
      id: "official-overview",
      title: "Read the official overview",
      detail:
        "Your Europe explains when EU air passenger rights apply, what care carriers must provide, and how to complain — in plain language linked to the regulation.",
      officialUrl: EC261_YOUR_EUROPE_URL,
      officialLabel: "Your Europe — air passenger rights",
    },
    {
      id: "now-desk",
      title: "At the airline desk now",
      detail:
        "Ask for written confirmation of denied boarding, cancellation, or your rebooking. Request care (meals, hotel if stranded overnight) and whether they classify the event as extraordinary circumstances.",
    },
    {
      id: "keep-proof",
      title: "Keep these documents",
      detail:
        "Boarding pass (even if unused), booking confirmation, any denial-of-boarding form, rebooking voucher, and receipts for meals, hotel, or transport you paid yourself.",
    },
    {
      id: "claim-carrier",
      title: "Claim with the operating carrier",
      detail:
        "Submit a written claim to the airline that operated the flight (not just the marketing carrier if different). Reference Regulation (EC) No 261/2004 and your flight number/date. Airlines often have an online complaints form.",
      officialUrl: EC261_REGULATION_URL,
      officialLabel: "Read Regulation (EC) No 261/2004",
    },
    {
      id: "escalate",
      title: "If the airline refuses or stalls",
      detail:
        "Escalate to the national enforcement body (NEB) in the EU country where the incident occurred (or where the airline is established). They cannot obtain compensation for you but can pursue the airline.",
      officialUrl: EC261_ENFORCEMENT_BODIES_URL,
      officialLabel: "EU national enforcement bodies (NEB list)",
    },
  ];

  const checklist = [
    "Confirm what happened (denied boarding, cancellation, or long delay).",
    "Get written proof from the airline desk or app.",
    "Ask for care while you wait (meals, hotel if overnight).",
    "Check which distance band applies — measure the route, do not guess euros.",
    "File with the operating carrier in writing.",
    "Escalate to the national enforcement body if needed — Kepi does not file for you.",
  ];

  return {
    eligible,
    headline,
    intro:
      "Kepi is a rights-notice coach — we cite official sources and route you to the airline and NEB. We do not file claims or invent amounts. Euro figures below are fixed sums from Article 7(1) of Regulation (EC) No 261/2004 only.",
    compensationBands: EC261_ARTICLE_7_BANDS,
    careSummary: careSummaryForReason(reason),
    extraordinaryCircumstances:
      "Article 5(3): compensation may be reduced or not owed if the airline proves the disruption was caused by extraordinary circumstances (e.g. severe weather, security risks, air traffic control) that could not have been avoided even if all reasonable measures had been taken.",
    reformNotice: buildEc261ReformNotice(),
    steps,
    checklist,
    disclaimer:
      "This is general guidance from official regulation text and EU public pages, not legal advice. Eligibility depends on your specific flight, routing, and whether the departure/arrival is in the EU scope of the regulation.",
  };
}

/** Pick compensation band from great-circle km when known; else unknown band with official table. */
export function ec261BandForDistanceKm(distanceKm: number | null | undefined): Ec261CompensationBand {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return {
      band: "unknown",
      distanceLabel: "Measure route distance to pick your band (Article 7(4))",
      amountEur: null,
      articleRef: "Article 7(1)",
    };
  }
  if (distanceKm <= 1500) return EC261_ARTICLE_7_BANDS[0]!;
  if (distanceKm <= 3500) return EC261_ARTICLE_7_BANDS[1]!;
  return EC261_ARTICLE_7_BANDS[2]!;
}
