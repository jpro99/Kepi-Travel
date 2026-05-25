/**
 * Scans a trip's reservations for planning gaps and potential problems.
 * Runs client-side — no server calls needed.
 */

export type GapSeverity = "critical" | "warning" | "info";

export interface TripGap {
  id: string;
  severity: GapSeverity;
  emoji: string;
  title: string;
  detail: string;
  actionLabel?: string;
  actionTab?: string;
}

interface GapReservation {
  id: string;
  type: string;
  provider: string;
  localTime: string;
  location: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  checkOutDate?: string;
  confirmationCode?: string;
}

function parseDayKey(localTime: string): string {
  return localTime.trim().slice(0, 10);
}

function parseMs(localTime: string): number {
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return Number.NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

function addDays(dateKey: string, days: number): string {
  const ms = Date.parse(dateKey + "T12:00:00");
  const d = new Date(ms + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(fromKey + "T12:00:00");
  const to = Date.parse(toKey + "T12:00:00");
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function detectTripGaps(reservations: GapReservation[], nowMs = Date.now()): TripGap[] {
  const gaps: TripGap[] = [];
  const todayKey = new Date(nowMs).toISOString().slice(0, 10);

  const upcoming = reservations
    .filter((r) => !Number.isNaN(parseMs(r.localTime)) && parseMs(r.localTime) > nowMs - 86_400_000)
    .sort((a, b) => parseMs(a.localTime) - parseMs(b.localTime));

  const flights = upcoming.filter((r) => r.type === "flight");
  const hotels = upcoming.filter((r) => r.type === "hotel");

  // ── 1. Flight tonight with no transport booked ───────────────────────────
  for (const flight of flights) {
    const flightMs = parseMs(flight.localTime);
    const hoursUntil = (flightMs - nowMs) / 3_600_000;
    if (hoursUntil > 0 && hoursUntil <= 6) {
      const hasRide = upcoming.some((r) =>
        (r.type === "ride" || r.type === "train") &&
        Math.abs(parseMs(r.localTime) - flightMs) < 4 * 3_600_000,
      );
      if (!hasRide) {
        gaps.push({
          id: `no-transport-${flight.id}`,
          severity: "critical",
          emoji: "🚨",
          title: "No transport to airport",
          detail: `Your flight departs in ${Math.round(hoursUntil)} hours but no taxi or train is booked. Book now — allow extra time for traffic.`,
          actionLabel: "Add transport",
          actionTab: "reservations",
        });
      }
    }
  }

  // ── 2. No hotel night before a flight ───────────────────────────────────
  for (const flight of flights) {
    const flightDayKey = parseDayKey(flight.localTime);
    const nightBeforeKey = addDays(flightDayKey, -1);
    if (nightBeforeKey < todayKey) continue; // already past
    const hasHotelCoveringNight = hotels.some((h) => {
      const checkInKey = parseDayKey(h.localTime);
      const checkOutKey = h.checkOutDate?.slice(0, 10) ?? addDays(checkInKey, 1);
      return checkInKey <= nightBeforeKey && checkOutKey > nightBeforeKey;
    });
    if (!hasHotelCoveringNight) {
      gaps.push({
        id: `no-hotel-night-before-${flight.id}`,
        severity: "warning",
        emoji: "🏨",
        title: "No hotel night before your flight",
        detail: `No accommodation found for ${nightBeforeKey}. If you need a place to stay the night before your ${flightDayKey} flight, add it now.`,
        actionLabel: "Add hotel",
        actionTab: "reservations",
      });
    }
  }

  // ── 3. Long gap between reservations (>2 nights with no hotel) ──────────
  for (let i = 0; i < flights.length - 1; i++) {
    const landing = flights[i];
    const nextDeparture = flights[i + 1];
    const landingKey = parseDayKey(landing.localTime);
    const nextKey = parseDayKey(nextDeparture.localTime);
    const nights = nightsBetween(landingKey, nextKey);
    if (nights > 1) {
      const hasHotel = hotels.some((h) => {
        const checkInKey = parseDayKey(h.localTime);
        return checkInKey > landingKey && checkInKey < nextKey;
      });
      if (!hasHotel) {
        gaps.push({
          id: `accommodation-gap-${landing.id}-${nextDeparture.id}`,
          severity: nights > 3 ? "warning" : "info",
          emoji: "🌙",
          title: `${nights} nights without accommodation`,
          detail: `No hotel found between ${landingKey} and ${nextKey}. Forward your hotel confirmation or add it manually.`,
          actionLabel: "Add hotel",
          actionTab: "reservations",
        });
      }
    }
  }

  // ── 4. Missing confirmation codes ────────────────────────────────────────
  const missingConf = upcoming.filter(
    (r) => (r.type === "flight" || r.type === "hotel") && !r.confirmationCode?.trim(),
  );
  if (missingConf.length > 0) {
    gaps.push({
      id: "missing-confirmation-codes",
      severity: "info",
      emoji: "🔖",
      title: `${missingConf.length} reservation${missingConf.length === 1 ? "" : "s"} missing confirmation code`,
      detail: `${missingConf.map((r) => r.provider || r.type).join(", ")} ${missingConf.length === 1 ? "has" : "have"} no confirmation code. Tap to add them so you can check in quickly.`,
      actionLabel: "Review",
      actionTab: "reservations",
    });
  }

  // ── 5. Flight in <24h, no online check-in noted ──────────────────────────
  for (const flight of flights) {
    const hoursUntil = (parseMs(flight.localTime) - nowMs) / 3_600_000;
    if (hoursUntil > 0 && hoursUntil <= 24) {
      gaps.push({
        id: `check-in-due-${flight.id}`,
        severity: hoursUntil < 4 ? "critical" : "warning",
        emoji: "📲",
        title: "Online check-in due",
        detail: `${flight.provider && !["gmail","yahoo","outlook"].includes(flight.provider.toLowerCase()) ? flight.provider : "Your airline"} check-in ${hoursUntil < 2 ? "closes soon" : "is open now"}. Check in online to save time at the airport.`,
      });
    }
  }

  // Deduplicate by id, limit to 6
  const seen = new Set<string>();
  return gaps.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  }).slice(0, 6);
}
