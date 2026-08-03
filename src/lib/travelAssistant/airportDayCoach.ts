/**
 * Pure helpers for Universal Airport Day Coach (AirportNavigatorFallback).
 * Mode derivation: journeyPhase.just-landed -> arrive; otherwise depart.
 */

import { resolveAirport } from "@/lib/airports/lookup";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";

export type AirportDayCoachMode = "depart" | "arrive";

export type DayCoachPathStep = {
  id: string;
  icon: string;
  text: string;
  detail?: string;
  minutes?: number;
};

/** Jeff-approved: journeyPhase just-landed is the sole trigger (not live status alone). */
export function deriveAirportDayCoachMode(
  phase: Pick<JourneyPhase, "kind"> | null | undefined,
): AirportDayCoachMode {
  return phase?.kind === "just-landed" ? "arrive" : "depart";
}

/** True when dep/arr countries differ; unknown codes -> treat as international (safer checklist). */
export function isInternationalArrivalFlight(
  departureIata: string | null | undefined,
  arrivalIata: string | null | undefined,
): boolean {
  const dep = resolveAirport((departureIata ?? "").trim());
  const arr = resolveAirport((arrivalIata ?? "").trim());
  if (!dep?.country || !arr?.country) return true;
  return dep.country.toUpperCase() !== arr.country.toUpperCase();
}

/** Time-budget reassurance under the departure header. Null under 45m (amber countdown owns urgency). */
export function departureTimeBudgetReassurance(minutesToDeparture: number): string | null {
  const minutes = Math.round(minutesToDeparture);
  if (minutes >= 90) return `${minutes}m until departure · plenty of time`;
  if (minutes >= 45) return `${minutes}m until departure · you're on track`;
  return null;
}

/**
 * Coach view shows current + next step; full-day shows all.
 * Without completion tracking, current = index 0.
 */
export function selectDayCoachVisibleSteps<T>(
  steps: readonly T[],
  fullDayView: boolean,
): { visible: T[]; hiddenCount: number } {
  if (fullDayView || steps.length <= 2) {
    return { visible: [...steps], hiddenCount: 0 };
  }
  return { visible: steps.slice(0, 2) as T[], hiddenCount: steps.length - 2 };
}


/** Format a live FA/ADB baggage claim for the arrival coach. Null if empty/untrusted. */
export function formatLiveBaggageCarouselNote(raw: string | null | undefined): string | null {
  const claim = (raw ?? "").trim();
  if (!claim || claim.length > 24) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9\s\-/#.]{0,22}$/u.test(claim)) return null;
  if (/carousel|belt|claim/i.test(claim)) {
    return `${claim} — from live flight status`;
  }
  return `Carousel ${claim} — from live flight status`;
}

export interface ArrivalDayCoachInput {
  iata: string;
  flightNumber?: string | null;
  airlineName?: string | null;
  departureIata?: string | null;
  arrivalTerminal?: string | null;
  hotelLabel?: string | null;
  baggageCarouselNote?: string | null;
  baggageWalkMinutes?: number | null;
}

/** Arrival path matching approved mockup (intl steps only when countries differ). */
export function buildArrivalDayCoachPath(input: ArrivalDayCoachInput): DayCoachPathStep[] {
  const code = input.iata.trim().toUpperCase();
  const intl = isInternationalArrivalFlight(input.departureIata, code);
  const flightLabel = input.flightNumber?.trim() || "your flight";
  const nav = getAirportNav(code);
  const curated =
    input.baggageCarouselNote?.trim() ||
    nav?.arrivalInfo?.baggageCarousels?.[0]?.carouselNote ||
    null;
  const walk =
    input.baggageWalkMinutes ?? nav?.arrivalInfo?.baggageCarousels?.[0]?.walkMinutes ?? undefined;

  const steps: DayCoachPathStep[] = [
    {
      id: "deplane",
      icon: "🛬",
      text: "Leave aircraft → Arrivals",
      detail: "Follow Arrivals signs — stay inside until baggage claim",
    },
  ];

  if (intl) {
    steps.push({
      id: "immigration",
      icon: "🛂",
      text: "Immigration / passport control",
      detail: "Have passport ready. Use Global Entry / Mobile Passport if enrolled.",
    });
  }

  steps.push({
    id: "bags",
    icon: "🧳",
    text: `Bags — claim for ${flightLabel}`,
    detail: curated || "Carousel number is on the airport screens — Kepi does not invent belt numbers.",
    minutes: walk && walk > 0 ? walk : undefined,
  });

  if (intl) {
    steps.push({
      id: "customs",
      icon: "📄",
      text: "Customs → Exit",
      detail: nav?.arrivalInfo?.customsTip || "Declare food/agriculture as required, then follow Exit / Ground Transport signs.",
    });
  } else {
    steps.push({
      id: "exit",
      icon: "🚪",
      text: "Exit to ground transport",
      detail: nav?.arrivalInfo?.exitDirections || "Follow Exit / Ground Transport signs to the arrivals curb.",
    });
  }

  const hotel = input.hotelLabel?.trim();
  steps.push({
    id: "ride",
    icon: "🚕",
    text: hotel ? `Ride / hotel — ${hotel}` : "Ride / hotel",
    detail: "Open Uber or your booked transfer once you are landside.",
  });

  return steps;
}
