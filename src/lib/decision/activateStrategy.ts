import { createTrip, setActiveTrip } from "@/lib/travelAssistant/tripStore";
import type { SessionReadinessItem, SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import type { ActivateStrategyResult, TravelStrategy, TripIntent } from "@/lib/decision/types";
import { generateId } from "@/lib/utils/generateId";
import { incrementTripCount } from "@/lib/traveler/travelerGenomeStore";

function readinessSeed(): SessionReadinessItem[] {
  const categories = [
    { category: "Flights", title: "Confirm flight reservations" },
    { category: "Hotels", title: "Confirm hotel booking" },
    { category: "Passport", title: "Verify passport validity (6+ months)" },
    { category: "Check-in timing", title: "Set check-in reminders" },
    { category: "Transportation", title: "Plan airport transfer" },
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

function reservationsFromStrategy(strategy: TravelStrategy, intent: TripIntent): SessionReservation[] {
  const reservations: SessionReservation[] = [];
  const flightSeg = strategy.segments.find((s) => s.mode === "flight");
  const hotelSeg = strategy.segments.find((s) => s.mode === "hotel");

  if (flightSeg) {
    const depAirport = strategy.departureAirports[0] ?? "LAX";
    reservations.push({
      id: generateId(),
      type: "flight",
      title: flightSeg.label,
      provider: "Alaska Airlines / Partner",
      localTime: `${intent.startDate}T08:00:00`,
      timezone: "America/Los_Angeles",
      location: `${depAirport} → ${intent.destinationIata}`,
      confirmationCode: "PENDING",
      assignedTo: ["You"],
      stage: "readiness",
      critical: true,
      confidence: "medium",
      notes: strategy.reasoning,
      source: "manual",
      flightNumber: "AS TBD",
      flightAirline: "Alaska",
      flightDate: intent.startDate,
      flightDepartureAirport: depAirport,
      flightArrivalAirport: intent.destinationIata,
      flightDepartureTime: "08:00",
      flightArrivalTime: "14:00",
      flightStatus: "scheduled",
      flightOnTime: true,
    });
  }

  if (hotelSeg) {
    reservations.push({
      id: generateId(),
      type: "hotel",
      title: hotelSeg.label,
      provider: "Hyatt",
      localTime: `${intent.startDate}T15:00:00`,
      timezone: "Europe/Rome",
      location: intent.destination,
      confirmationCode: "PENDING",
      assignedTo: ["You"],
      stage: "readiness",
      critical: false,
      confidence: "medium",
      notes: hotelSeg.detail,
      source: "manual",
      checkOutDate: intent.endDate,
      roomType: "Standard / Suite per strategy",
    });
  }

  return reservations;
}

export async function activateStrategy(
  strategy: TravelStrategy,
  intent: TripIntent,
  userId?: string,
): Promise<ActivateStrategyResult> {
  const tripName = `${intent.region} — ${strategy.title}`;
  const trip = await createTrip(
    {
      name: tripName,
      destination: intent.destination,
      startDate: intent.startDate,
      endDate: intent.endDate,
      stage: "readiness",
      reservations: reservationsFromStrategy(strategy, intent),
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
