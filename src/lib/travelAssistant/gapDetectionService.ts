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
  timezone?: string;
  location: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  // All possible field names for checkout date across different storage formats
  checkOutDate?: string;
  checkoutDate?: string;
  checkout_date?: string;
  check_out_date?: string;
  checkOut?: string;
  endDate?: string;
  confirmationCode?: string;
  notes?: string;
}

function extractCheckoutFromNotes(notes: string): string {
  if (!notes) return "";
  // Same patterns as parseCheckoutFromNotes in page.tsx — must stay in sync
  const patterns = [
    /check[\s-]?out\s+(?:on\s+|the\s+|by\s+)?(\w+\s+\d{1,2}(?:th|st|nd|rd)?(?:[,\s]+\d{4})?)/iu,
    /check[\s-]?out\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/iu,
    /(?:checking out|checks? out)\s+(?:on\s+|the\s+)?(\w+\s+\d{1,2}(?:th|st|nd|rd)?(?:[,\s]+\d{4})?)/iu,
    /depart(?:ure|s|ing)?\s+(?:on\s+)?(\w+\s+\d{1,2}(?:th|st|nd|rd)?(?:[,\s]+\d{4})?)/iu,
    /(\d{4}-\d{2}-\d{2})\s*(?:checkout|check.out|departure)/iu,
  ];
  for (const pattern of patterns) {
    const match = notes.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].replace(/(\d+)(?:th|st|nd|rd)/gu, "$1").trim();
      const ms = Date.parse(cleaned);
      if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
    }
  }
  // Ordinal-only fallback
  const ordinalOnly = notes.match(/(?:check[\s-]?out|checkout|checking out|depart)[^0-9]*(\d{1,2})(?:th|st|nd|rd)?(?:\s|$)/iu);
  if (ordinalOnly?.[1]) {
    const day = parseInt(ordinalOnly[1], 10);
    if (day >= 1 && day <= 31) {
      const now = new Date();
      const candidate = new Date(now.getFullYear(), now.getMonth(), day);
      if (candidate < now) candidate.setMonth(candidate.getMonth() + 1);
      return candidate.toISOString().slice(0, 10);
    }
  }
  return "";
}

function parseDayKey(localTime: string): string {
  return localTime.trim().slice(0, 10);
}

function flightDayKey(r: GapReservation): string {
  // Use flightDate first (most reliable) — localTime may be email receive time
  if (r.flightDate) return r.flightDate.slice(0, 10);
  return parseDayKey(r.localTime);
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

  // Use flightDate for flights (localTime may be email receive time, not actual departure)
  // Convert local time + timezone to UTC ms for accurate cross-timezone comparison.
  // Without this, HND 21:20 JST and HNL 13:41 HST on the same calendar date
  // cannot be correctly ordered or diffed.
  const toUtcMs = (r: GapReservation): number => {
    const local = r.localTime?.trim() ?? "";
    const tz = (r as GapReservation & { timezone?: string }).timezone?.trim() ?? "Etc/UTC";
    if (!local) return Number.NaN;
    try {
      const [datePart = "", timePart = "00:00"] = local.split(" ");
      const [year, month, day] = datePart.split("-").map(Number);
      const [hour, minute] = timePart.split(":").map(Number);
      if (!year || !month || !day) return Number.NaN;
      const localDate = new Date(year, (month ?? 1) - 1, day, hour ?? 0, minute ?? 0);
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      const parts = Object.fromEntries(formatter.formatToParts(localDate).map(p => [p.type, p.value]));
      const tzDate = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
      const offsetMs = tzDate.getTime() - localDate.getTime();
      return localDate.getTime() - offsetMs;
    } catch {
      return parseMs(local);
    }
  };

  const getReservationMs = (r: GapReservation): number => toUtcMs(r);

  const upcoming = reservations
    .filter((r) => getReservationMs(r) > nowMs - 86_400_000)
    .sort((a, b) => getReservationMs(a) - getReservationMs(b));

  const flights = upcoming.filter((r) => r.type === "flight");

  // Hotels use checkOutDate for coverage — include ALL hotels regardless of check-in date
  // A hotel checked in days ago can still cover future nights
  const hotels = reservations.filter((r) => r.type === "hotel");

  // ── 1. Flight tonight with no transport booked ───────────────────────────
  for (const flight of flights) {
    const flightMs = getReservationMs(flight);
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
  // Only check the first flight of each departure day to avoid duplicate alerts
  const checkedNightBefore = new Set<string>();
  for (const flight of flights) {
    const flightDay = flightDayKey(flight);
    if (checkedNightBefore.has(flightDay)) continue; // already checked this day
    checkedNightBefore.add(flightDay);
    const nightBeforeKey = addDays(flightDay, -1);
    if (nightBeforeKey < todayKey) continue; // already past
    const hasHotelCoveringNight = hotels.some((h) => {
      const checkInKey = parseDayKey(h.localTime);
      const checkOutKey = (
        h.checkOutDate?.slice(0, 10) ||
        h.checkoutDate?.slice(0, 10) ||
        h.checkout_date?.slice(0, 10) ||
        h.check_out_date?.slice(0, 10) ||
        h.checkOut?.slice(0, 10) ||
        h.endDate?.slice(0, 10) ||
        extractCheckoutFromNotes(h.notes ?? "")
      );
      if (!checkOutKey) return false;
      return checkInKey <= nightBeforeKey && checkOutKey > nightBeforeKey;
    });
    if (!hasHotelCoveringNight) {
      gaps.push({
        id: `no-hotel-night-before-${flightDay}`,
        severity: "warning",
        emoji: "🏨",
        title: "No hotel night before your flight",
        detail: `No accommodation found for ${nightBeforeKey}. If you need a place to stay the night before your ${flightDay} flight, add it now.`,
        actionLabel: "Add hotel",
        actionTab: "reservations",
      });
    }
  }

  // ── 3. Long gap between reservations (>2 nights with no hotel) ──────────
  for (let i = 0; i < flights.length - 1; i++) {
    const landing = flights[i];
    const nextDeparture = flights[i + 1];
    const landingKey = flightDayKey(landing);
    const nextDeptKey = flightDayKey(nextDeparture);
    const nights = nightsBetween(landingKey, nextDeptKey);
    if (nights > 1) {
      const hasHotel = hotels.some((h) => {
        // Only count hotel if check-in is confirmed between the two flights
        // Do not assume duration — require explicit checkOutDate
        const checkInKey = parseDayKey(h.localTime);
        const checkOutKey = (
          h.checkOutDate?.slice(0, 10) ||
          h.checkoutDate?.slice(0, 10) ||
          h.checkout_date?.slice(0, 10) ||
          h.check_out_date?.slice(0, 10) ||
          h.checkOut?.slice(0, 10) ||
          h.endDate?.slice(0, 10) ||
          extractCheckoutFromNotes(h.notes ?? "")
        );
        if (!checkInKey) return false;
        // Hotel covers the gap if it checks in before next departure
        // and checks out after landing (or at minimum checks in during the gap)
        if (checkOutKey) {
          return checkInKey <= nextDeptKey && checkOutKey > landingKey;
        }
        // No checkout date — only count if check-in is within the gap
        return checkInKey > landingKey && checkInKey < nextDeptKey;
      });
      if (!hasHotel) {
        gaps.push({
          id: `accommodation-gap-${landing.id}-${nextDeparture.id}`,
          severity: nights > 3 ? "warning" : "info",
          emoji: "🌙",
          title: `${nights} nights without accommodation`,
          detail: `No hotel found between ${landingKey} and ${nextDeptKey}. Forward your hotel confirmation or add it manually.`,
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
    const hoursUntil = (getReservationMs(flight) - nowMs) / 3_600_000;
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

  // ── 5. Same-day connections — check minimum connection time ────────────────
  const flightsByDate = new Map<string, typeof flights>();
  for (const flight of flights) {
    const day = flightDayKey(flight);
    const arr = flightsByDate.get(day) ?? [];
    arr.push(flight);
    flightsByDate.set(day, arr);
  }
  for (const [, dayFlights] of flightsByDate.entries()) {
    if (dayFlights.length < 2) continue;
    const sorted = [...dayFlights].sort((a, b) => getReservationMs(a) - getReservationMs(b));
    for (let i = 0; i < sorted.length - 1; i++) {
      const arriving = sorted[i];
      const departing = sorted[i + 1];
      const arrMs = getReservationMs(arriving);
      const depMs = getReservationMs(departing);
      const connectionMins = (depMs - arrMs) / 60_000;
      const arrivalAirport = (arriving as GapReservation & { flightArrivalAirport?: string }).flightArrivalAirport ?? "";
      // Hawaii from international = needs 90-120 min for customs/ag inspection
      const isIntlToHawaii = arrivalAirport.toUpperCase() === "HNL" &&
        ((arriving as GapReservation & { flightDepartureAirport?: string }).flightDepartureAirport ?? "").toUpperCase() !== "SEA" &&
        ((arriving as GapReservation & { flightDepartureAirport?: string }).flightDepartureAirport ?? "").toUpperCase() !== "LAX" &&
        ((arriving as GapReservation & { flightDepartureAirport?: string }).flightDepartureAirport ?? "").toUpperCase() !== "SFO";
      const minConnection = isIntlToHawaii ? 150 : 60;
      if (connectionMins > 0 && connectionMins < minConnection) {
        gaps.push({
          id: `tight-connection-${arriving.id}-${departing.id}`,
          severity: connectionMins < minConnection * 0.6 ? "critical" : "warning",
          emoji: isIntlToHawaii ? "🛂" : "⏱",
          title: isIntlToHawaii
            ? `Tight connection — US Customs required in Honolulu`
            : `Tight connection — ${Math.round(connectionMins)} min`,
          detail: isIntlToHawaii
            ? `You must clear US Customs, collect bags, pass USDA agriculture inspection, re-check bags, and clear TSA again in Honolulu before your next flight. This typically takes 90-120 minutes. Your connection of ${Math.round(connectionMins)} min may not be enough — contact your airline.`
            : `Only ${Math.round(connectionMins)} minutes between flights. Minimum recommended is ${minConnection} minutes. Contact your airline if you have checked bags.`,
        });
      }
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
