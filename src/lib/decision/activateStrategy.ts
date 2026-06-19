import { createTrip, setActiveTrip } from "@/lib/travelAssistant/tripStore";
import type { SessionReadinessItem, SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import type { ActivateStrategyResult, SelectedStayActivation, TravelStrategy, TripIntent } from "@/lib/decision/types";
import type { AlignmentLeg } from "@/lib/decision/tripAlignment";
import { countVerifiedLegs } from "@/lib/decision/tripAlignment";
import { resolveHotelBookUrl } from "@/lib/decision/bookingLinks";
import { allocateStopDates } from "@/lib/decision/stopDates";
import { generateId } from "@/lib/utils/generateId";
import { incrementTripCount } from "@/lib/traveler/travelerGenomeStore";

const IATA_TIMEZONE: Record<string, string> = {
  FCO: "Europe/Rome",
  FLR: "Europe/Rome",
  MXP: "Europe/Rome",
  VCE: "Europe/Rome",
  BRI: "Europe/Rome",
  MUC: "Europe/Berlin",
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
    { category: "Flights", title: "Book flights from your walkthrough links" },
    { category: "Flights", title: "Forward confirmations to replace planned legs" },
    { category: "Hotels", title: "Book hotels after flights are set" },
    { category: "Passport", title: "Verify passport validity (6+ months)" },
    { category: "Transportation", title: "Plan airport transfers between cities" },
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
  const book = resolveHotelBookUrl({
    propertyName: stay.name,
    chainName: stay.chainName,
    location: stay.area?.trim() || location,
    checkInDate: stay.checkInDate,
    checkOutDate: stay.checkOutDate,
    quotedPriceUsd: total,
    quoteId: stay.quoteId,
  });

  return {
    id: generateId(),
    type: "hotel",
    title: stay.name,
    provider: stay.chainName?.trim() || stay.name,
    localTime: `${stay.checkInDate}T15:00:00`,
    timezone,
    location: stay.area?.trim() || location,
    confirmationCode: "PLANNED",
    assignedTo: ["You"],
    stage: "readiness",
    critical: false,
    confidence: "high",
    notes: isEstimated
      ? "Planned stay from Command Deck — book hotel, then forward confirmation"
      : `Planned stay · ${stay.currency} ${total} total — forward confirmation when booked`,
    source: "manual",
    plannedOnly: true,
    quotedPriceUsd: total,
    checkOutDate: stay.checkOutDate,
    roomType: `$${nightly}/night · $${total} total`,
    bookUrl: book.url,
  };
}

function plannedLegReservation(leg: AlignmentLeg): SessionReservation | null {
  if (leg.role === "ground") {
    return {
      id: generateId(),
      type: "train",
      title: leg.label,
      provider: "Ground",
      localTime: leg.departureDate ? `${leg.departureDate}T09:00:00` : "2099-01-01T09:00:00",
      timezone: "Etc/UTC",
      location: leg.label,
      confirmationCode: "PLANNED",
      assignedTo: ["You"],
      stage: "readiness",
      critical: false,
      confidence: "medium",
      notes: `${leg.detail} · Not a flight booking`,
      source: "manual",
      plannedOnly: true,
    };
  }

  if (leg.role === "hotel") {
    const purchaseUrl = leg.bookUrl;
    const notesParts = [
      leg.statusLabel,
      leg.detail,
      purchaseUrl ? `Purchase: ${purchaseUrl}` : null,
      "Forward your confirmation email after booking",
    ].filter(Boolean);
    return {
      id: generateId(),
      type: "hotel",
      title: leg.label,
      provider: leg.airline?.trim() || "Hotel",
      localTime: leg.departureDate ? `${leg.departureDate}T15:00:00` : "2099-01-01T15:00:00",
      timezone: "Etc/UTC",
      location: leg.label,
      confirmationCode: "PLANNED",
      assignedTo: ["You"],
      stage: "readiness",
      critical: false,
      confidence: leg.status === "verified" ? "high" : "medium",
      notes: notesParts.join(" · "),
      source: "manual",
      plannedOnly: true,
      quotedPriceUsd: leg.priceUsd,
      checkOutDate: leg.checkOutDate,
      bookUrl: purchaseUrl,
    };
  }

  if (!leg.originIata || !leg.destinationIata) return null;

  const tz = timezoneForDestination(leg.originIata);
  const purchaseUrl = leg.bookUrl ?? leg.verifyUrl;
  const notesParts = [
    leg.statusLabel,
    leg.detail,
    purchaseUrl ? `Purchase: ${purchaseUrl}` : null,
    "Forward your confirmation email after booking to add real times and record locator",
  ].filter(Boolean);

  return {
    id: generateId(),
    type: "flight",
    title: leg.label,
    provider: leg.airline ?? (leg.role === "award" ? "Partner award" : "Airline"),
    localTime: leg.departureDate ? `${leg.departureDate}T12:00:00` : "2099-01-01T12:00:00",
    timezone: tz,
    location: `${leg.originIata} → ${leg.destinationIata}`,
    confirmationCode: "PLANNED",
    assignedTo: ["You"],
    stage: "readiness",
    critical: leg.role === "outbound" || leg.role === "return",
    confidence: leg.status === "verified" ? "high" : "medium",
    notes: notesParts.join(" · "),
    source: "manual",
    plannedOnly: true,
    bookUrl: purchaseUrl,
    quotedPriceUsd: leg.priceUsd,
    flightAirline: leg.airline,
    flightDate: leg.departureDate,
    flightDepartureAirport: leg.originIata,
    flightArrivalAirport: leg.destinationIata,
    flightNumber: "Not booked yet",
  };
}

function reservationsFromAlignment(
  alignmentLegs: AlignmentLeg[],
  selectedStays?: SelectedStayActivation[] | null,
  intent?: TripIntent,
): SessionReservation[] {
  const reservations: SessionReservation[] = [];
  const hasSelectedHotelLegs = alignmentLegs.some((leg) => leg.id.startsWith("hotel-selected"));

  for (const leg of alignmentLegs) {
    const row = plannedLegReservation(leg);
    if (row) reservations.push(row);
  }

  if (selectedStays && selectedStays.length > 0 && !hasSelectedHotelLegs && intent) {
    const stopRanges = allocateStopDates(intent);
    selectedStays.forEach((stay, index) => {
      const stop = stopRanges[index]?.stop ?? intent.stops?.[index];
      reservations.push(
        hotelReservationFromStay(
          stay,
          stop?.name ?? intent.destination,
          stop?.iata ?? intent.destinationIata,
        ),
      );
    });
  }

  return reservations;
}

function reservationsFromStrategyLegacy(
  strategy: TravelStrategy,
  intent: TripIntent,
  selectedStays?: SelectedStayActivation[] | null,
): SessionReservation[] {
  const depAirport = strategy.departureAirports[0] ?? intent.originAirports?.[0];
  if (!depAirport) {
    throw new Error("Cannot activate strategy without a departure airport");
  }
  const stopRanges = allocateStopDates(intent);
  const arrivalIata = stopRanges[0]?.stop.iata ?? intent.destinationIata;
  const returnIata = intent.returnAirports?.[0] ?? intent.destinationIata;
  const homeIata = depAirport;

  const legs: AlignmentLeg[] = [
    {
      id: "outbound",
      step: 1,
      role: "outbound",
      label: `${depAirport} → ${arrivalIata}`,
      detail: strategy.reasoning,
      status: "modeled",
      statusLabel: "Modeled playbook",
      originIata: depAirport,
      destinationIata: arrivalIata,
      departureDate: intent.startDate,
    },
    {
      id: "return",
      step: 2,
      role: "return",
      label: `${returnIata} → ${homeIata}`,
      detail: "Return leg",
      status: "modeled",
      statusLabel: "Modeled playbook",
      originIata: returnIata,
      destinationIata: homeIata,
      departureDate: intent.endDate,
    },
  ];

  return reservationsFromAlignment(legs, selectedStays, intent);
}

export async function activateStrategy(
  strategy: TravelStrategy,
  intent: TripIntent,
  userId?: string,
  selectedStays?: SelectedStayActivation[] | null,
  alignmentLegs: AlignmentLeg[] = [],
): Promise<ActivateStrategyResult> {
  const tripName = intent.isMultiCity
    ? `${intent.region} multi-city — ${strategy.title}`
    : `${intent.region} — ${strategy.title}`;

  const legs = alignmentLegs.length > 0 ? alignmentLegs : [];
  const reservations =
    legs.length > 0
      ? reservationsFromAlignment(legs, selectedStays, intent)
      : reservationsFromStrategyLegacy(strategy, intent, selectedStays);

  const { verified, total } = countVerifiedLegs(legs);

  const trip = await createTrip(
    {
      name: tripName,
      destination: intent.destination,
      startDate: intent.startDate,
      endDate: intent.endDate,
      stage: "readiness",
      reservations,
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
    redirectPath: `/travel-assistant?tripId=${encodeURIComponent(trip.id)}&stage=readiness&tab=trip&walkthrough=1`,
    alignmentLegs: legs,
    verifiedLegCount: verified,
    totalBookableLegs: total,
  };
}
