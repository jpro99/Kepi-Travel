import { createTrip, setActiveTrip } from "@/lib/travelAssistant/tripStore";
import type { SessionReadinessItem, SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import type { ActivateStrategyResult, SelectedStayActivation, TravelStrategy, TripIntent } from "@/lib/decision/types";
import { allocateStopDates } from "@/lib/decision/stopDates";
import { generateId } from "@/lib/utils/generateId";
import { incrementTripCount } from "@/lib/traveler/travelerGenomeStore";

const IATA_TIMEZONE: Record<string, string> = {
  FCO: "Europe/Rome",
  FLR: "Europe/Rome",
  MXP: "Europe/Rome",
  VCE: "Europe/Rome",
  BRI: "Europe/Rome",
  CDG: "Europe/Paris",
  NRT: "Asia/Tokyo",
  HND: "Asia/Tokyo",
  LHR: "Europe/London",
  HNL: "Pacific/Honolulu",
  SEA: "America/Los_Angeles",
  LAX: "America/Los_Angeles",
  ONT: "America/Los_Angeles",
  SNA: "America/Los_Angeles",
};

function timezoneForDestination(iata: string): string {
  return IATA_TIMEZONE[iata.toUpperCase()] ?? "Etc/UTC";
}

function readinessSeed(): SessionReadinessItem[] {
  const categories = [
    { category: "Flights", title: "Confirm flight reservations" },
    { category: "Hotels", title: "Confirm hotel bookings" },
    { category: "Passport", title: "Verify passport validity (6+ months)" },
    { category: "Check-in timing", title: "Set check-in reminders" },
    { category: "Transportation", title: "Plan airport transfers between cities" },
    { category: "Essentials", title: "Travel insurance / medical cards packed" },
  ];
  return categories.map((c) => ({
    id: generateId(),
    category: c.category,
    title: c.title,
    complete: false,
    required: c.category === "Passport" || c.category === "Flights",
  }));
}

function hotelReservationFromStay(stay: SelectedStayActivation, location: string, iata: string): SessionReservation {
  const timezone = timezoneForDestination(iata);
  const nightly = Math.round(stay.nightlyUsd);
  const total = Math.round(stay.totalAmountUsd);
  const isEstimated = stay.quoteId.startsWith("est-");
  const noteParts = [
    isEstimated
      ? "Estimated rate from Command Deck — confirm before booking"
      : `Selected on Command Deck · ${stay.currency} ${total} total`,
    stay.photoUrl ? `Photo: ${stay.photoUrl}` : null,
  ].filter(Boolean);

  return {
    id: generateId(),
    type: "hotel",
    title: stay.name,
    provider: stay.chainName?.trim() || stay.name,
    localTime: `${stay.checkInDate}T15:00:00`,
    timezone,
    location: stay.area?.trim() || location,
    confirmationCode: "SELECTED",
    assignedTo: ["You"],
    stage: "readiness",
    critical: false,
    confidence: "high",
    notes: noteParts.join(" · "),
    source: "manual",
    checkOutDate: stay.checkOutDate,
    roomType: `$${nightly}/night · $${total} total (quote ${stay.quoteId.slice(0, 8)}…)`,
  };
}

function placeholderHotelReservation(
  label: string,
  detail: string,
  location: string,
  iata: string,
  checkIn: string,
  checkOut: string,
): SessionReservation {
  return {
    id: generateId(),
    type: "hotel",
    title: label,
    provider: "Hyatt",
    localTime: `${checkIn}T15:00:00`,
    timezone: timezoneForDestination(iata),
    location,
    confirmationCode: "PENDING",
    assignedTo: ["You"],
    stage: "readiness",
    critical: false,
    confidence: "medium",
    notes: detail,
    source: "manual",
    checkOutDate: checkOut,
    roomType: "Standard / Suite per strategy",
  };
}

function flightReservation(input: {
  title: string;
  depAirport: string;
  arrAirport: string;
  date: string;
  notes: string;
  preferAlaska?: boolean;
}): SessionReservation {
  return {
    id: generateId(),
    type: "flight",
    title: input.title,
    provider: input.preferAlaska ? "Alaska Airlines / Partner" : "Airline",
    localTime: `${input.date}T08:00:00`,
    timezone: "America/Los_Angeles",
    location: `${input.depAirport} → ${input.arrAirport}`,
    confirmationCode: "PENDING",
    assignedTo: ["You"],
    stage: "readiness",
    critical: true,
    confidence: "medium",
    notes: input.notes,
    source: "manual",
    flightNumber: input.preferAlaska ? "AS TBD" : "TBD",
    flightAirline: input.preferAlaska ? "Alaska" : "Partner",
    flightDate: input.date,
    flightDepartureAirport: input.depAirport,
    flightArrivalAirport: input.arrAirport,
    flightDepartureTime: "08:00",
    flightArrivalTime: "14:00",
    flightStatus: "scheduled",
    flightOnTime: true,
  };
}

function reservationsFromStrategy(
  strategy: TravelStrategy,
  intent: TripIntent,
  selectedStay?: SelectedStayActivation | null,
): SessionReservation[] {
  const reservations: SessionReservation[] = [];
  const depAirport = strategy.departureAirports[0] ?? intent.originAirports?.[0] ?? "LAX";
  const preferAlaska = intent.preferredAirlines?.includes("Alaska");
  const stopRanges = allocateStopDates(intent);
  const arrivalIata = stopRanges[0]?.stop.iata ?? intent.destinationIata;
  const returnIata = stopRanges[stopRanges.length - 1]?.stop.iata ?? intent.destinationIata;

  if (stopRanges.length > 0) {
    reservations.push(
      flightReservation({
        title: `${depAirport} → ${arrivalIata}`,
        depAirport,
        arrAirport: arrivalIata,
        date: intent.startDate,
        notes: strategy.reasoning,
        preferAlaska,
      }),
    );

    for (const range of stopRanges) {
      const hotelSeg = strategy.segments.find(
        (s) => s.mode === "hotel" && s.label.toLowerCase().includes(range.stop.name.toLowerCase()),
      );
      reservations.push(
        placeholderHotelReservation(
          hotelSeg?.label ?? `${range.stop.name} stay`,
          hotelSeg?.detail ?? `Confirm hotel in ${range.stop.name}`,
          range.stop.name,
          range.stop.iata ?? intent.destinationIata,
          range.checkIn,
          range.checkOut,
        ),
      );
    }

    reservations.push(
      flightReservation({
        title: `${returnIata} → ${depAirport}`,
        depAirport: returnIata,
        arrAirport: depAirport,
        date: intent.endDate,
        notes: "Return flight — confirm times after outbound is booked.",
        preferAlaska,
      }),
    );

    if (selectedStay && stopRanges[0]) {
      reservations[1] = hotelReservationFromStay(
        { ...selectedStay, checkInDate: stopRanges[0].checkIn, checkOutDate: stopRanges[0].checkOut },
        stopRanges[0].stop.name,
        stopRanges[0].stop.iata ?? intent.destinationIata,
      );
    }

    return reservations;
  }

  const flightSeg = strategy.segments.find((s) => s.mode === "flight");
  const hotelSeg = strategy.segments.find((s) => s.mode === "hotel");

  if (flightSeg) {
    reservations.push(
      flightReservation({
        title: flightSeg.label,
        depAirport,
        arrAirport: intent.destinationIata,
        date: intent.startDate,
        notes: strategy.reasoning,
        preferAlaska,
      }),
    );
  }

  if (selectedStay) {
    reservations.push(
      hotelReservationFromStay(selectedStay, intent.destination, intent.destinationIata),
    );
  } else if (hotelSeg) {
    reservations.push(
      placeholderHotelReservation(
        hotelSeg.label,
        hotelSeg.detail,
        intent.destination,
        intent.destinationIata,
        intent.startDate,
        intent.endDate,
      ),
    );
  }

  return reservations;
}

export async function activateStrategy(
  strategy: TravelStrategy,
  intent: TripIntent,
  userId?: string,
  selectedStay?: SelectedStayActivation | null,
): Promise<ActivateStrategyResult> {
  const tripName = intent.isMultiCity
    ? `${intent.region} multi-city — ${strategy.title}`
    : `${intent.region} — ${strategy.title}`;

  const trip = await createTrip(
    {
      name: tripName,
      destination: intent.destination,
      startDate: intent.startDate,
      endDate: intent.endDate,
      stage: "readiness",
      reservations: reservationsFromStrategy(strategy, intent, selectedStay),
      readinessItems: readinessSeed(),
      tripStatus: "yellow",
      minutesToDeparture: 60 * 24 * 14,
    },
    userId,
  );

  await setActiveTrip(trip.id, userId);
  await incrementTripCount(userId);

  return {
    tripId: trip.id,
    tripName: trip.name,
    redirectPath: `/travel-assistant?tripId=${encodeURIComponent(trip.id)}&stage=readiness&tab=trip&activated=1`,
  };
}
