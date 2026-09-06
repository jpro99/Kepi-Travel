import type { AttentionItem, MissionControlReservation } from "@/lib/travelAssistant/tripPhase";
import { REVIEW_INBOX_HONEST_DETAIL } from "@/lib/travelAssistant/reviewCtaHonesty";

export type HomeNextActionKind =
  | "airport"
  | "attention"
  | "prep"
  | "review"
  | "flight"
  | "ready";

export interface HomePrepWatchItem {
  id: string;
  title: string;
  detail: string;
  href?: string;
}

export interface HomeNextAction {
  kind: HomeNextActionKind;
  eyebrow: string;
  title: string;
  detail?: string;
  ctaLabel: string;
  /** When kind is attention — drive gap / reservation tap. */
  attention?: AttentionItem;
  /** When kind is prep and item has an external link. */
  prepHref?: string;
  reservationId?: string;
}

/**
 * Pick the single Home “next up” action — one job, one CTA.
 * Priority: airport → live problem/gap → review inbox → prep watch → next flight → ready.
 */
export function pickHomeNextAction(input: {
  openAirportMode?: boolean;
  atAirport?: boolean;
  attentionTop3: AttentionItem[];
  prepWatchItems?: HomePrepWatchItem[];
  prepMode?: boolean;
  unresolvedReviewCount?: number;
  nextFlight?: MissionControlReservation | null;
  /** When set, replaces generic airport CTA with a specific spotlight line (G46). */
  airportSpotlight?: HomeNextAction | null;
  /** G49 — active stay coach beats remaining-flight headline on mid-stay days. */
  todayCoach?: HomeNextAction | null;
}): HomeNextAction {
  if (input.airportSpotlight) {
    return input.airportSpotlight;
  }
  if (input.openAirportMode || input.atAirport) {
    return {
      kind: "airport",
      eyebrow: "Next up",
      title: "Open Airport Mode",
      detail: "Gate, walk, and what to do now — before you’re late.",
      ctaLabel: "Open Airport Mode",
    };
  }

  const top = input.attentionTop3[0];
  if (top) {
    return {
      kind: "attention",
      eyebrow: "Next up",
      title: top.title,
      detail: top.detail,
      ctaLabel: top.actionLabel?.trim() || "Take care of this",
      attention: top,
      reservationId: top.reservationId,
    };
  }

  const reviewCount = input.unresolvedReviewCount ?? 0;
  if (reviewCount > 0) {
    return {
      kind: "review",
      eyebrow: "Next up",
      title:
        reviewCount === 1
          ? "1 booking waiting for your OK"
          : `${reviewCount} bookings waiting for your OK`,
      detail: REVIEW_INBOX_HONEST_DETAIL,
      ctaLabel: reviewCount === 1 ? "Review booking" : "Review bookings",
    };
  }

  if (input.prepMode && input.prepWatchItems && input.prepWatchItems.length > 0) {
    const prep = input.prepWatchItems[0]!;
    return {
      kind: "prep",
      eyebrow: "Next up",
      title: prep.title,
      detail: prep.detail,
      ctaLabel: prep.href ? "Open official guidance" : "Open Plan",
      prepHref: prep.href,
    };
  }

  if (input.todayCoach) {
    return input.todayCoach;
  }

  if (input.nextFlight?.id) {
    const from = input.nextFlight.flightDepartureAirport?.trim() || "";
    const to = input.nextFlight.flightArrivalAirport?.trim() || "";
    const route = from && to ? `${from} → ${to}` : "Your next flight";
    return {
      kind: "flight",
      eyebrow: "Next up",
      title: input.nextFlight.flightNumber?.trim()
        ? `${input.nextFlight.flightNumber} · ${route}`
        : route,
      detail: "Tap to open details, status, and check-in when it’s time.",
      ctaLabel: "Open flight",
      reservationId: input.nextFlight.id,
    };
  }

  return {
    kind: "ready",
    eyebrow: "You’re set",
    title: "Nothing urgent right now",
    detail: "Forward a new confirmation anytime — Kepi will add it to your trip.",
    ctaLabel: "Open Plan",
  };
}
