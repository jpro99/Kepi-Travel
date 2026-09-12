/**
 * G58 — Travel-day arrival stay: where you're sleeping tonight + how to get there.
 * Uses booked hotel/Airbnb facts only — never invents addresses or check-in times.
 */

import { citiesLikelySame, deriveHotelSearchCityFromReservation } from "@/lib/hotels/hotelReservationCity";
import { getAirportByIata } from "@/lib/travelAssistant/airportGeo";
import {
  resolveArrivalTransportPresentation,
  sanitizeArrivalHotelLabelForUi,
} from "@/lib/travelAssistant/arrivalTransportPresentation";
import type { HomeStayReservation } from "@/lib/travelAssistant/homeTodayCoach";
import { dateOnly } from "@/lib/travelAssistant/homeTodayCoach";
import type { HomeTravelDayFlight } from "@/lib/travelAssistant/homeTravelDayCoach";
import { formatTravelDayArrivalLabel } from "@/lib/travelAssistant/homeTravelDayCoach";
import {
  buildSharedHotelContact,
  extractAddressFromText,
} from "@/lib/travelAssistant/sharedHotelInfo";

export interface TravelDayArrivalStay {
  reservationId: string;
  propertyName: string;
  city: string;
  address: string | null;
  checkInTimeLabel: string | null;
  arrivalAirport: string | null;
  mapsUrl: string | null;
  phoneTelHref: string | null;
  headline: string;
  detail: string;
  transportNote: string | null;
}

function stayCityLabel(hotel: HomeStayReservation): string {
  return (
    hotel.hotelSearchCity?.trim() ||
    deriveHotelSearchCityFromReservation(hotel) ||
    hotel.location?.trim() ||
    ""
  );
}

/** Hotels/Airbnbs with check-in on this calendar day. */
export function findCheckInStaysForDay(
  reservations: readonly HomeStayReservation[],
  dateKey: string,
): HomeStayReservation[] {
  return reservations.filter((row) => {
    if (row.type !== "hotel" || row.plannedOnly) return false;
    if (row.confirmationCode?.trim().toUpperCase() === "PLANNED") return false;
    return dateOnly(row.localTime) === dateKey;
  });
}

function pickCheckInStay(
  checkIns: HomeStayReservation[],
  flight: HomeTravelDayFlight | null,
): HomeStayReservation | null {
  if (checkIns.length === 0) return null;
  if (checkIns.length === 1) return checkIns[0]!;

  if (flight) {
    const arrivalCity = formatTravelDayArrivalLabel(flight);
    const matched = checkIns.find((row) => {
      const city = stayCityLabel(row);
      return city && citiesLikelySame(city, arrivalCity);
    });
    if (matched) return matched;
  }

  return checkIns[0]!;
}

function arrivalAirportLabel(iata: string): string {
  const code = iata.trim().toUpperCase();
  const airport = getAirportByIata(code);
  return airport?.name?.trim() || code;
}

function buildTransportNote(input: {
  arrivalIata: string | null;
  flight: HomeTravelDayFlight | null;
  hotelLabel: string | null;
  timezone?: string | null;
}): string | null {
  const iata = input.arrivalIata?.trim().toUpperCase() ?? "";
  if (!iata) return null;

  const presentation = resolveArrivalTransportPresentation({
    iata,
    flightArrivalTime: input.flight?.flightArrivalTime,
    flightTimezone: input.timezone ?? null,
    hotelLabel: input.hotelLabel,
  });

  if (presentation?.rideStepDetail?.trim()) return presentation.rideStepDetail.trim();
  if (presentation?.scheduleNote?.trim()) return presentation.scheduleNote.trim();

  const firstOption = presentation?.transportOptions?.[0];
  if (firstOption?.description?.trim()) return firstOption.description.trim();

  return `After you land at ${arrivalAirportLabel(iata)}, open Maps for directions to your stay.`;
}

export function buildTravelDayArrivalStay(input: {
  hotel: HomeStayReservation;
  flight: HomeTravelDayFlight | null;
}): TravelDayArrivalStay {
  const contact = buildSharedHotelContact({
    type: "hotel",
    title: input.hotel.title?.trim() || "Stay",
    provider: input.hotel.provider?.trim() || "",
    localTime: input.hotel.localTime?.trim() || "",
    location: input.hotel.location?.trim() || "",
    confirmationCode: input.hotel.confirmationCode?.trim() || "",
    checkOutDate: input.hotel.checkOutDate,
    notes: input.hotel.notes,
  });

  const city = stayCityLabel(input.hotel) || formatTravelDayArrivalLabel(input.flight ?? {});
  const notesAddress = extractAddressFromText(input.hotel.notes ?? "");
  const locationLine = input.hotel.location?.trim() || "";
  const addressCandidate = notesAddress || contact.address || locationLine;
  const address =
    addressCandidate &&
    (!city || !citiesLikelySame(addressCandidate, city) || addressCandidate.length > city.length + 4)
      ? addressCandidate
      : null;

  const arrivalIata = input.flight?.flightArrivalAirport?.trim().toUpperCase() || null;
  const transportNote = buildTransportNote({
    arrivalIata,
    flight: input.flight,
    hotelLabel: sanitizeArrivalHotelLabelForUi(contact.hotelName),
    timezone: input.hotel.timezone,
  });

  const detailParts: string[] = [];
  if (address) detailParts.push(address);
  else if (city) detailParts.push(city);
  if (contact.checkInTimeLabel) detailParts.push(`Check-in from ${contact.checkInTimeLabel}`);
  if (transportNote) detailParts.push(transportNote);

  return {
    reservationId: input.hotel.id,
    propertyName: contact.hotelName,
    city,
    address,
    checkInTimeLabel: contact.checkInTimeLabel || null,
    arrivalAirport: arrivalIata,
    mapsUrl: contact.mapsUrl,
    phoneTelHref: contact.phoneTelHref,
    headline: `Tonight — ${contact.hotelName}`,
    detail: detailParts.join(" · ") || `You're checking in at ${contact.hotelName} tonight.`,
    transportNote,
  };
}

export function resolveTravelDayArrivalStay(
  reservations: readonly HomeStayReservation[],
  dateKey: string,
  flight: HomeTravelDayFlight | null,
): TravelDayArrivalStay | null {
  const checkIns = findCheckInStaysForDay(reservations, dateKey);
  const hotel = pickCheckInStay(checkIns, flight);
  if (!hotel) return null;
  return buildTravelDayArrivalStay({ hotel, flight });
}
