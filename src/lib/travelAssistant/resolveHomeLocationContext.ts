/**
 * G67 — One resolver for "where is the traveler now?" local help / geo context.
 * Trip truth (today's stay, today's train, stop range) beats first-hotel-in-list or stale trip.destination.
 */

import type { StopDateRange } from "@/lib/decision/stopDates";
import { deriveHotelSearchCityFromReservation } from "@/lib/hotels/hotelReservationCity";
import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { getAirportByIata } from "@/lib/travelAssistant/airportGeo";
import { buildDayStayTimeline } from "@/lib/travelAssistant/dayStayTimeline";
import {
  dateOnly,
  hotelCoversCalendarDay,
  resolveActiveHotelForDay,
  travelerTodayKey,
  type HomeStayReservation,
} from "@/lib/travelAssistant/homeTodayCoach";
import { isPlannedReservation } from "@/lib/travelAssistant/plannedReservationMatch";
import { resolveTrainFields } from "@/lib/travelAssistant/trainReservationFields";
import { isBookedTrainReservation } from "@/lib/travelAssistant/trainTicketHandoff";

export type HomeLocationSource =
  | "today_stay"
  | "today_train"
  | "stop_range"
  | "day_plan"
  | "at_airport"
  | "trip_destination"
  | "unknown";

export interface HomeLocationContext {
  displayCity: string | null;
  source: HomeLocationSource;
  confidence: "high" | "medium" | "low";
  todayKey: string;
}

const STATION_DISPLAY_CITY: Record<string, string> = {
  bolzano: "Bolzano",
  bozen: "Bolzano",
  "münchen hbf": "Munich",
  "muenchen hbf": "Munich",
  munich: "Munich",
  lecce: "Lecce",
  bari: "Bari",
  "bari centrale": "Bari",
  monopoli: "Monopoli",
  polignano: "Polignano a Mare",
  venice: "Venice",
  "venezia s. lucia": "Venice",
  "venezia s lucia": "Venice",
  cortina: "Cortina d'Ampezzo",
  innsbruck: "Innsbruck",
  "innsbruck hbf": "Innsbruck",
  rome: "Rome",
  "roma termini": "Rome",
  milan: "Milan",
  "milano centrale": "Milan",
  florence: "Florence",
  naples: "Naples",
};

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/gu, " ");
}

/** Station or city label → friendly local-help city (English where travelers expect it). */
export function stationToLocalHelpCity(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const key = normalizeKey(trimmed);
  if (STATION_DISPLAY_CITY[key]) return STATION_DISPLAY_CITY[key]!;
  const withoutSuffix = key
    .replace(/\s+hbf$/u, "")
    .replace(/\s+centrale$/u, "")
    .replace(/\s+s\.?\s*lucia$/u, "")
    .trim();
  if (STATION_DISPLAY_CITY[withoutSuffix]) return STATION_DISPLAY_CITY[withoutSuffix]!;
  if (/^m[üu]nchen/u.test(withoutSuffix) || withoutSuffix === "muenchen") return "Munich";
  if (/^venezia/u.test(withoutSuffix)) return "Venice";
  if (/^roma/u.test(withoutSuffix)) return "Rome";
  if (/^milano/u.test(withoutSuffix)) return "Milan";
  return trimmed.split(/\s*\/\s*/u)[0]?.trim() || trimmed;
}

function isBookedHotel(reservation: HomeStayReservation): boolean {
  if ((reservation.type ?? "").toLowerCase() !== "hotel") return false;
  if (reservation.plannedOnly === true) return false;
  if (isPlannedReservation(reservation)) return false;
  return Boolean(reservation.confirmationCode?.trim() || reservation.localTime?.trim());
}

function isBookedTrain(reservation: HomeStayReservation): boolean {
  return isBookedTrainReservation({
    ...reservation,
    confirmationCode: reservation.confirmationCode ?? undefined,
  });
}

function parseLocalDateTimeMs(localTime: string | undefined): number | null {
  const match = (localTime ?? "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/u);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const ms = Date.parse(`${match[1]}T${match[2]}:${match[3]}:00`);
  return Number.isNaN(ms) ? null : ms;
}

/** Parse arrival time from ÖBB/DB ticket text when stored on the reservation. */
function parseTrainArrivalMs(reservation: HomeStayReservation, dateKey: string): number | null {
  const blob = `${reservation.originalEmailText ?? ""}\n${reservation.notes ?? ""}\n${reservation.location ?? ""}`;
  const arrivalStationTime = blob.match(
    /\b(M[üu]nchen(?:\s+Hbf)?|Munich(?:\s+Hbf)?|MUENCHEN(?:\s+HBF)?)\s+(\d{1,2})[:.](\d{2})\b/iu,
  );
  if (arrivalStationTime?.[2] && arrivalStationTime[3]) {
    const ms = Date.parse(
      `${dateKey}T${arrivalStationTime[2].padStart(2, "0")}:${arrivalStationTime[3]}:00`,
    );
    if (!Number.isNaN(ms)) return ms;
  }
  const timeThenStation = blob.match(
    /\b(\d{1,2})[:.](\d{2})\s*\n\s*[^\n]{0,40}?(M[üu]nchen|Munich|MUENCHEN)/iu,
  );
  if (timeThenStation?.[1] && timeThenStation[2]) {
    const ms = Date.parse(
      `${dateKey}T${timeThenStation[1].padStart(2, "0")}:${timeThenStation[2]}:00`,
    );
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

function resolveTrainCityToday(
  trains: HomeStayReservation[],
  todayKey: string,
  nowMs: number,
): { city: string; source: HomeLocationSource } | null {
  const todayTrains = trains.filter(
    (row) => isBookedTrain(row) && dateOnly(row.localTime) === todayKey,
  );
  if (todayTrains.length === 0) return null;

  const train = todayTrains.sort((a, b) =>
    (a.localTime ?? "").localeCompare(b.localTime ?? ""),
  )[0]!;
  const fields = resolveTrainFields(train);
  const depMs = parseLocalDateTimeMs(train.localTime);
  const arrMs = parseTrainArrivalMs(train, todayKey);

  if (depMs != null && nowMs < depMs - 30 * 60_000) {
    const from = stationToLocalHelpCity(fields.fromStation || fields.serviceLabel);
    if (from) return { city: from, source: "today_train" };
  }

  if (arrMs != null && nowMs >= arrMs) {
    const to = stationToLocalHelpCity(fields.toStation);
    if (to) return { city: to, source: "today_train" };
  }

  if (depMs != null && nowMs >= depMs) {
    const to = stationToLocalHelpCity(fields.toStation);
    if (to) return { city: to, source: "today_train" };
  }

  const from = stationToLocalHelpCity(fields.fromStation || fields.serviceLabel);
  if (from) return { city: from, source: "today_train" };
  return null;
}

function resolveStopCityForDay(stopRanges: StopDateRange[], dateKey: string): string | null {
  const range = stopRanges.find((row) => dateKey >= row.checkIn && dateKey < row.checkOut);
  return range?.stop.name?.trim() || null;
}

function resolveAirportMetroCity(iata: string | null | undefined): string | null {
  const code = iata?.trim().toUpperCase();
  if (!code) return null;
  const formatted = formatHotelSearchCityLabel(code);
  if (formatted.label?.trim()) {
    return formatted.label.replace(/\s*\([A-Z]{3}\)\s*$/u, "").trim() || null;
  }
  const airport = getAirportByIata(code);
  if (airport?.name?.trim()) {
    return airport.name.replace(/\s+(International|Airport|Intl\.?)$/iu, "").trim() || airport.name.trim();
  }
  return code;
}

function isPlaceholderDestination(destination: string | null | undefined): boolean {
  if (!destination?.trim()) return true;
  const normalized = destination.trim().toLowerCase();
  return (
    normalized === "set destination" ||
    normalized === "destination pending" ||
    normalized === "your trip"
  );
}

export interface ResolveHomeLocationContextInput {
  reservations: HomeStayReservation[];
  stopRanges?: StopDateRange[];
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  dayNotes?: Record<string, string>;
  tripDestination?: string | null;
  nowMs?: number;
  timezone?: string | null;
  locationStatus?: string | null;
  nearestAirportIata?: string | null;
}

/**
 * Resolve the city shown in Ask Kepi ("Near …"), support context, and local prompts.
 */
export function resolveHomeLocationContext(
  input: ResolveHomeLocationContextInput,
): HomeLocationContext {
  const nowMs = input.nowMs ?? Date.now();
  const stopRanges = input.stopRanges ?? [];
  const todayKey = travelerTodayKey(nowMs, input.timezone ?? null);
  const hotels = input.reservations.filter((row) => (row.type ?? "").toLowerCase() === "hotel");
  const trains = input.reservations.filter((row) => (row.type ?? "").toLowerCase() === "train");

  if (
    (input.locationStatus === "at-airport" || input.locationStatus === "in-terminal") &&
    input.nearestAirportIata?.trim()
  ) {
    const airportCity = resolveAirportMetroCity(input.nearestAirportIata);
    if (airportCity) {
      return {
        displayCity: airportCity,
        source: "at_airport",
        confidence: "high",
        todayKey,
      };
    }
  }

  const trainHit = resolveTrainCityToday(trains, todayKey, nowMs);
  if (trainHit) {
    return {
      displayCity: trainHit.city,
      source: trainHit.source,
      confidence: "high",
      todayKey,
    };
  }

  const activeHotel = resolveActiveHotelForDay(hotels, todayKey, stopRanges);
  if (activeHotel) {
    const city =
      activeHotel.hotelSearchCity?.trim() ||
      deriveHotelSearchCityFromReservation(activeHotel) ||
      activeHotel.location?.trim();
    if (city) {
      return {
        displayCity: stationToLocalHelpCity(city),
        source: "today_stay",
        confidence: "high",
        todayKey,
      };
    }
  }

  const stopCity = resolveStopCityForDay(stopRanges, todayKey);
  if (stopCity) {
    return {
      displayCity: stationToLocalHelpCity(stopCity),
      source: "stop_range",
      confidence: "medium",
      todayKey,
    };
  }

  const timeline = buildDayStayTimeline(
    input.tripStartDate,
    input.tripEndDate,
    input.dayNotes ?? {},
    stopRanges,
  );
  const daySnap = timeline.get(todayKey);
  if (daySnap?.stayCity?.trim()) {
    return {
      displayCity: stationToLocalHelpCity(daySnap.stayCity),
      source: "day_plan",
      confidence: "medium",
      todayKey,
    };
  }

  const upcomingHotel = hotels
    .filter(isBookedHotel)
    .filter((row) => {
      const checkIn = dateOnly(row.localTime);
      return checkIn && checkIn >= todayKey;
    })
    .sort((a, b) => dateOnly(a.localTime).localeCompare(dateOnly(b.localTime)))[0];
  if (upcomingHotel) {
    const city =
      upcomingHotel.hotelSearchCity?.trim() ||
      deriveHotelSearchCityFromReservation(upcomingHotel);
    if (city) {
      return {
        displayCity: stationToLocalHelpCity(city),
        source: "today_stay",
        confidence: "low",
        todayKey,
      };
    }
  }

  if (!isPlaceholderDestination(input.tripDestination)) {
    return {
      displayCity: stationToLocalHelpCity(input.tripDestination!.trim()),
      source: "trip_destination",
      confidence: "low",
      todayKey,
    };
  }

  return {
    displayCity: null,
    source: "unknown",
    confidence: "low",
    todayKey,
  };
}

/** True when a hotel covers tonight for calendar today. */
export function hasActiveStayTonight(
  reservations: HomeStayReservation[],
  stopRanges: StopDateRange[],
  todayKey: string,
): boolean {
  const hotels = reservations.filter((row) => (row.type ?? "").toLowerCase() === "hotel");
  return (
    resolveActiveHotelForDay(hotels, todayKey, stopRanges) != null ||
    hotels.some((row) => hotelCoversCalendarDay(row, todayKey))
  );
}
