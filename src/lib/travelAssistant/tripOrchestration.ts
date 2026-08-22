/**
 * G31 — Trip orchestration: entry docs, readiness truth, schedule overlap, stage hints.
 * Calm Apple voice; never invent immigration rules.
 */

import type { AttentionItem, MissionControlPhase, ReadinessStatus } from "@/lib/travelAssistant/tripPhase";
import type { TripFlowStage } from "@/lib/travelAssistant/tripFlowControls";

export interface ReadinessChecklistItem {
  id: string;
  title: string;
  complete: boolean;
  required: boolean;
}

export interface EntryGuidanceItem {
  id: string;
  title: string;
  detail: string;
  href?: string;
  tone: "watch" | "needs_you";
  checklistId?: string;
}

export interface ScheduleCollision {
  id: string;
  title: string;
  detail: string;
  reservationIds: [string, string];
  overlapMinutes: number;
}

export type TripReadinessLevel = "ready" | "almost" | "needs_you";

export interface TripReadinessSummary {
  level: TripReadinessLevel;
  headline: string;
  detail: string;
  completedEssentials: number;
  totalEssentials: number;
  blockers: string[];
}

export interface TimedReservation {
  id: string;
  type: string;
  title?: string;
  localTime?: string;
  location?: string;
}

const DURATION_MINUTES: Record<string, number> = {
  flight: 120,
  train: 90,
  ride: 45,
  dinner: 120,
  hotel: 60,
};

const SCHENGEN_RE =
  /\b(italy|italia|rome|venice|monopoli|polignano|lecce|munich|germany|france|spain|schengen|europe|florence|milan|naples|amalfi|positano|bologna|turin|sicily|tuscany|puglia)\b/iu;
const CANADA_RE = /\b(canada|toronto|vancouver|montreal|calgary|ottawa|yvr|yyz|yul)\b/iu;
const UK_RE = /\b(united kingdom|england|london|scotland|edinburgh|uk\b)\b/iu;

function collectPlaceText(input: {
  destination?: string | null;
  hotelCities?: string[];
}): string {
  return [input.destination, ...(input.hotelCities ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Gentle entry / passport nudges — prep mode only. */
export function buildEntryGuidanceItems(input: {
  destination?: string | null;
  hotelCities?: string[];
  daysUntilDeparture?: number | null;
  passportComplete?: boolean;
  tripEndDate?: string | null;
}): EntryGuidanceItem[] {
  const days = input.daysUntilDeparture;
  if (days == null || days <= 0 || days > 90) return [];

  const places = collectPlaceText(input);
  const items: EntryGuidanceItem[] = [];

  if (!input.passportComplete) {
    items.push({
      id: "entry-passport",
      title: "Passport check",
      detail:
        days > 30
          ? "Most countries want your passport valid 6 months past your return date. If you haven't looked yet, now is a calm time to check."
          : "Before you go: confirm your passport is valid at least 6 months past your return date.",
      tone: days <= 21 ? "needs_you" : "watch",
      checklistId: "ready-passport",
    });
  }

  if (SCHENGEN_RE.test(places)) {
    items.push({
      id: "entry-schengen",
      title: "Italy / Schengen entry (typical US tourist)",
      detail:
        "Short tourist visits are usually visa-free for US passports (under 90 days in Schengen). Confirm your passport and situation on the official site — Kepi is not immigration advice.",
      href: "https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/Italy.html",
      tone: "watch",
    });
  }

  if (CANADA_RE.test(places)) {
    items.push({
      id: "entry-eta-canada",
      title: "Canada entry — eTA reminder",
      detail:
        "Flying to Canada usually requires an approved eTA for visa-exempt travelers. If you already have one, you're set. If not, apply on the official Government of Canada site.",
      href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta.html",
      tone: input.passportComplete ? "watch" : "needs_you",
    });
  }

  if (UK_RE.test(places)) {
    items.push({
      id: "entry-uk-eta",
      title: "UK entry check",
      detail:
        "Many US visitors need an Electronic Travel Authorisation (ETA) for the UK. Confirm on the official UK site if you're not sure you already have one.",
      href: "https://www.gov.uk/guidance/electronic-travel-authorisation-eta",
      tone: "watch",
    });
  }

  return items.slice(0, 3);
}

function parseReservationWindow(reservation: TimedReservation): {
  startMs: number;
  endMs: number;
  day: string;
} | null {
  const raw = reservation.localTime?.trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/u);
  if (!match?.[1]) return null;
  const day = match[1];
  const hour = match[2] ? Number(match[2].slice(0, 2)) : 12;
  const minute = match[2] ? Number(match[2].slice(3, 5)) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const startMs = Date.parse(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  if (Number.isNaN(startMs)) return null;
  const durationMinutes = DURATION_MINUTES[reservation.type.trim().toLowerCase()] ?? 90;
  return { startMs, endMs: startMs + durationMinutes * 60_000, day };
}

function labelReservation(reservation: TimedReservation): string {
  return reservation.title?.trim() || reservation.type.trim() || "Booking";
}

/**
 * Overlapping timed bookings on the same day (dinner vs flight, etc.).
 *
 * Hotels are excluded from collision detection entirely: a check-in/out
 * time is an open-ended arrival window, not a fixed appointment, so
 * checking into a hotel the same day you fly somewhere (the single most
 * common travel pattern there is) is normal, not a scheduling conflict.
 * Comparing it against a flight's/train's/ride's fixed 60-120min window
 * produced false "X overlaps Y" collisions for completely ordinary
 * itineraries. Real timed-appointment conflicts (dinner vs flight, etc.)
 * are unaffected.
 */
export function detectScheduleCollisions(
  reservations: readonly TimedReservation[],
  bufferMinutes = 15,
): ScheduleCollision[] {
  const timed = reservations
    .filter((reservation) => reservation.type.trim().toLowerCase() !== "hotel")
    .map((reservation) => ({ reservation, window: parseReservationWindow(reservation) }))
    .filter((row): row is { reservation: TimedReservation; window: NonNullable<typeof row.window> } =>
      Boolean(row.window),
    )
    .filter((row) => /\d{2}:\d{2}/u.test(row.reservation.localTime ?? ""));

  const collisions: ScheduleCollision[] = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i]!;
      const b = timed[j]!;
      if (a.window.day !== b.window.day) continue;
      const overlapMs =
        Math.min(a.window.endMs, b.window.endMs) - Math.max(a.window.startMs, b.window.startMs);
      if (overlapMs <= bufferMinutes * 60_000) continue;
      const overlapMinutes = Math.round(overlapMs / 60_000);
      const left = labelReservation(a.reservation);
      const right = labelReservation(b.reservation);
      collisions.push({
        id: `collision-${a.reservation.id}-${b.reservation.id}`,
        title: `${left} overlaps ${right}`,
        detail: `Same day — about ${overlapMinutes} minute${overlapMinutes === 1 ? "" : "s"} overlap. Shift one or confirm the times.`,
        reservationIds: [a.reservation.id, b.reservation.id],
        overlapMinutes,
      });
    }
  }
  return collisions.slice(0, 4);
}

export function scheduleCollisionToAttention(collision: ScheduleCollision): AttentionItem {
  return {
    id: collision.id,
    status: "needs_you",
    title: collision.title,
    detail: collision.detail,
    actionLabel: "Open Plan",
    actionTab: "plan",
    reservationId: collision.reservationIds[0],
  };
}

export function entryGuidanceToAttention(item: EntryGuidanceItem): AttentionItem {
  return {
    id: item.id,
    status: item.tone === "needs_you" ? "needs_you" : "watch",
    title: item.title,
    detail: item.detail,
    actionLabel: item.href ? "Official guidance" : "Open checklist",
    actionTab: "more",
  };
}

export function buildTripReadinessSummary(input: {
  tripLabel: string;
  checklistItems: readonly ReadinessChecklistItem[];
  gapAttentionCount: number;
  reviewCount: number;
  entryItems: readonly EntryGuidanceItem[];
  collisions: readonly ScheduleCollision[];
}): TripReadinessSummary {
  const essentials = input.checklistItems.filter((item) => item.required);
  const completedEssentials = essentials.filter((item) => item.complete).length;
  const totalEssentials = essentials.length;
  const entryNeedsYou = input.entryItems.filter((item) => item.tone === "needs_you").length;

  const blockers: string[] = [];
  if (input.reviewCount > 0) {
    blockers.push(
      input.reviewCount === 1 ? "1 booking to review" : `${input.reviewCount} bookings to review`,
    );
  }
  if (input.gapAttentionCount > 0) {
    blockers.push(input.gapAttentionCount === 1 ? "1 trip gap" : `${input.gapAttentionCount} trip gaps`);
  }
  if (input.collisions.length > 0) {
    blockers.push(
      input.collisions.length === 1 ? "schedule overlap" : `${input.collisions.length} schedule overlaps`,
    );
  }
  if (entryNeedsYou > 0) {
    blockers.push("documents to confirm");
  }
  const openEssentials = totalEssentials - completedEssentials;
  if (openEssentials > 0) {
    blockers.push(
      openEssentials === 1 ? "1 checklist item left" : `${openEssentials} checklist items left`,
    );
  }

  let level: TripReadinessLevel = "needs_you";
  if (blockers.length === 0) {
    level = "ready";
  } else if (blockers.length === 1 && openEssentials <= 1 && input.reviewCount === 0) {
    level = "almost";
  }

  const place = input.tripLabel.trim() || "your trip";
  const headline =
    level === "ready"
      ? `Ready for ${place}`
      : level === "almost"
        ? `Almost ready for ${place}`
        : `${place} — a few things left`;

  const detail =
    level === "ready"
      ? "Bookings, documents, and schedule look aligned. Kepi will watch for changes."
      : blockers.slice(0, 3).join(" · ");

  return {
    level,
    headline,
    detail,
    completedEssentials,
    totalEssentials,
    blockers,
  };
}

const STAGE_ORDER: TripFlowStage[] = ["readiness", "pre-departure", "airport", "arrival", "recovery"];

/** Consumer-only auto stage — forward only, never regress. */
export function suggestConsumerTripStage(input: {
  current: TripFlowStage;
  missionPhase: MissionControlPhase;
  daysUntilDeparture: number | null;
  readinessLevel: TripReadinessLevel;
  hasBlockingGaps: boolean;
  reviewCount: number;
  journeyPhaseKind?: string;
}): TripFlowStage | null {
  let suggested = input.current;

  if (input.missionPhase === "departure_day" || input.missionPhase === "return_day") {
    suggested = "airport";
  } else if (input.missionPhase === "at_destination") {
    suggested = "arrival";
  } else if (input.journeyPhaseKind === "just-landed") {
    suggested = "arrival";
  } else if (input.journeyPhaseKind === "airborne") {
    suggested = "airport";
  } else if (input.daysUntilDeparture != null) {
    if (input.daysUntilDeparture <= 1) {
      suggested = "pre-departure";
    } else if (
      input.daysUntilDeparture <= 14 &&
      input.readinessLevel !== "needs_you" &&
      input.reviewCount === 0 &&
      !input.hasBlockingGaps
    ) {
      suggested = "pre-departure";
    } else if (input.daysUntilDeparture > 21) {
      suggested = "readiness";
    }
  }

  const currentIdx = STAGE_ORDER.indexOf(input.current);
  const suggestedIdx = STAGE_ORDER.indexOf(suggested);
  if (suggestedIdx > currentIdx) return suggested;
  return null;
}

export function readinessLevelToStatus(level: TripReadinessLevel): ReadinessStatus {
  if (level === "ready") return "set";
  if (level === "almost") return "watch";
  return "needs_you";
}
