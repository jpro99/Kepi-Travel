import { airportToCity } from "@/lib/travelAssistant/buildTripLegs";

export interface DayWalkthroughReservation {
  id: string;
  type: string;
  title: string;
  provider?: string;
  localTime: string;
  location?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDate?: string;
  flightAirline?: string;
  checkOutDate?: string;
}

export interface BuildDayWalkthroughInput {
  dateKey: string;
  reservations: DayWalkthroughReservation[];
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  stayCity?: string | null;
  dayIndexInTrip?: number;
  tripDayCount?: number;
  dayIndexInLeg?: number;
  legDayCount?: number;
}

export interface DayWalkthrough {
  headline: string;
  summary: string;
  paragraphs: string[];
}

function dateKeyFromTime(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().slice(0, 10);
}

function flightDepartureDateKey(reservation: DayWalkthroughReservation): string {
  if (reservation.flightDate?.trim()) return reservation.flightDate.slice(0, 10);
  return reservation.localTime.trim().slice(0, 10);
}

export function reservationsForDayWalkthrough(
  dateKey: string,
  reservations: DayWalkthroughReservation[],
): DayWalkthroughReservation[] {
  const results: DayWalkthroughReservation[] = [];
  for (const reservation of reservations) {
    if (reservation.type === "hotel") {
      const start = reservation.localTime.trim().slice(0, 10);
      const end = reservation.checkOutDate?.slice(0, 10) ?? start;
      if (start <= dateKey && dateKey <= end) results.push(reservation);
      continue;
    }
    if (reservation.type === "flight") {
      const dep = flightDepartureDateKey(reservation);
      const arr = dateKeyFromTime(reservation.flightArrivalTime);
      if (dep === dateKey || arr === dateKey) results.push(reservation);
      continue;
    }
    if (reservation.localTime.trim().slice(0, 10) === dateKey) results.push(reservation);
  }
  return results;
}

function formatFriendlyTime(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hour = +match[1]!;
  const minute = match[2]!;
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

function cityFromAirport(iata: string | undefined): string {
  if (!iata?.trim()) return "your destination";
  return airportToCity(iata);
}

function airlineLabel(reservation: DayWalkthroughReservation): string {
  const number = reservation.flightNumber?.trim();
  const airline = reservation.flightAirline ?? reservation.provider;
  if (number && airline) return `${airline} ${number}`;
  if (number) return number;
  if (airline) return airline;
  return "your flight";
}

function hotelName(reservation: DayWalkthroughReservation): string {
  return reservation.provider?.trim() || reservation.title?.trim() || "your hotel";
}

function isFirstTripDay(dateKey: string, tripStartDate: string | null | undefined): boolean {
  return Boolean(tripStartDate && dateKey === tripStartDate.slice(0, 10));
}

function isLastTripDay(dateKey: string, tripEndDate: string | null | undefined): boolean {
  return Boolean(tripEndDate && dateKey === tripEndDate.slice(0, 10));
}

type HotelRole = "check-in" | "checkout" | "stay";

function hotelRoleOnDay(hotel: DayWalkthroughReservation, dateKey: string): HotelRole {
  const start = hotel.localTime.trim().slice(0, 10);
  const end = hotel.checkOutDate?.slice(0, 10) ?? start;
  if (dateKey === start) return "check-in";
  if (dateKey === end) return "checkout";
  return "stay";
}

function describeFlightOnDay(flight: DayWalkthroughReservation, dateKey: string): string {
  const depKey = flightDepartureDateKey(flight);
  const arrKey = dateKeyFromTime(flight.flightArrivalTime);
  const depCity = cityFromAirport(flight.flightDepartureAirport);
  const arrCity = cityFromAirport(flight.flightArrivalAirport);
  const label = airlineLabel(flight);

  if (depKey === dateKey && arrKey === dateKey) {
    const depTime = formatFriendlyTime(flight.flightDepartureTime ?? flight.localTime);
    const arrTime = formatFriendlyTime(flight.flightArrivalTime);
    const depPart = depTime ? ` leaves ${depCity} around ${depTime}` : ` departs from ${depCity}`;
    const arrPart = arrTime ? ` and lands in ${arrCity} around ${arrTime}` : ` and arrives in ${arrCity}`;
    return `${label}${depPart}${arrPart}.`;
  }
  if (depKey === dateKey) {
    const depTime = formatFriendlyTime(flight.flightDepartureTime ?? flight.localTime);
    return depTime
      ? `${label} leaves ${depCity} around ${depTime}, headed for ${arrCity}.`
      : `${label} takes you from ${depCity} to ${arrCity} today.`;
  }
  const arrTime = formatFriendlyTime(flight.flightArrivalTime);
  return arrTime
    ? `You land in ${arrCity} around ${arrTime} on ${label}.`
    : `You arrive in ${arrCity} today on ${label}.`;
}

function finalDestinationCity(flights: DayWalkthroughReservation[]): string | null {
  const last = flights[flights.length - 1];
  if (!last?.flightArrivalAirport) return null;
  return cityFromAirport(last.flightArrivalAirport);
}

export function buildDayWalkthrough(input: BuildDayWalkthroughInput): DayWalkthrough {
  const { dateKey, reservations, tripStartDate, tripEndDate, stayCity } = input;
  const dayReservations = reservationsForDayWalkthrough(dateKey, reservations);

  const flights = dayReservations.filter((r) => r.type === "flight");
  const hotels = dayReservations.filter((r) => r.type === "hotel");
  const other = dayReservations.filter((r) => r.type !== "flight" && r.type !== "hotel");

  const departingFlights = flights.filter((f) => flightDepartureDateKey(f) === dateKey);
  const arrivingFlights = flights.filter((f) => {
    const arrKey = dateKeyFromTime(f.flightArrivalTime);
    return arrKey === dateKey && flightDepartureDateKey(f) !== dateKey;
  });

  const primaryHotel = hotels[0] ?? null;
  const hotelRole = primaryHotel ? hotelRoleOnDay(primaryHotel, dateKey) : null;
  const arrivalCity =
    stayCity?.trim() ||
    cityFromAirport(arrivingFlights[0]?.flightArrivalAirport ?? departingFlights[0]?.flightArrivalAirport);

  const isFirst = isFirstTripDay(dateKey, tripStartDate);
  const isLast = isLastTripDay(dateKey, tripEndDate);
  const hasFlights = flights.length > 0;
  const travelOnly = hasFlights && hotels.length === 0 && other.length === 0;
  const arrivingToday =
    arrivingFlights.length > 0 ||
    (departingFlights.some((f) => f.flightArrivalAirport) &&
      primaryHotel != null &&
      hotelRole === "check-in");

  const paragraphs: string[] = [];
  let headline: string;

  if (dayReservations.length === 0) {
    headline = isFirst ? "Trip starts today" : isLast ? "Trip ends today" : stayCity ? `Open day in ${stayCity}` : "Open day";
    paragraphs.push(
      isFirst
        ? "Your trip window starts today. Add flights, hotels, or notes when you're ready."
        : stayCity
          ? `Nothing is booked yet in ${stayCity} — a blank canvas for exploring or resting.`
          : "No bookings on the calendar yet — tap Edit plan to sketch out how you'd like the day to go.",
    );
  } else if (travelOnly && isFirst) {
    headline = "Your first travel day";
    paragraphs.push("This is where your trip begins — today is about getting where you're going by air.");
  } else if (travelOnly && isLast) {
    headline = "Heading home";
    paragraphs.push("Today's a travel day — you'll be in transit as your trip winds down.");
  } else if (travelOnly) {
    const dest = finalDestinationCity(departingFlights) ?? "your next stop";
    headline = `Travel day — off to ${dest}`;
    paragraphs.push(`Today's a travel day — you're moving on toward ${dest}.`);
  } else if (arrivingToday && arrivalCity) {
    headline = `Arriving in ${arrivalCity}`;
    paragraphs.push(`Welcome day — you're reaching ${arrivalCity}.`);
  } else if (hotelRole === "check-in" && !hasFlights && arrivalCity) {
    headline = `Check-in day in ${arrivalCity}`;
    paragraphs.push(`You'll settle into ${arrivalCity} today.`);
  } else if (hotelRole === "checkout" && !hasFlights) {
    headline = arrivalCity ? `Last morning in ${arrivalCity}` : "Checkout day";
    paragraphs.push(`You're checking out of ${hotelName(primaryHotel!)} today.`);
  } else if (arrivalCity && hotelRole === "stay" && !hasFlights) {
    const dayNum = input.dayIndexInLeg ?? input.dayIndexInTrip;
    headline = dayNum ? `Day ${dayNum} in ${arrivalCity}` : `Exploring ${arrivalCity}`;
    paragraphs.push(
      primaryHotel
        ? `You're in ${arrivalCity}, staying at ${hotelName(primaryHotel)}. No flights today — it's an open day unless you've added plans below.`
        : `You're in ${arrivalCity} with nothing else on the calendar — enjoy the open day.`,
    );
  } else {
    headline = "Your day so far";
    paragraphs.push("Here's how today is shaping up:");
  }

  const orderedFlights = [
    ...departingFlights,
    ...arrivingFlights.filter((f) => !departingFlights.includes(f)),
  ];
  for (const flight of orderedFlights) {
    paragraphs.push(describeFlightOnDay(flight, dateKey));
  }

  if (primaryHotel && hotelRole === "check-in" && hasFlights) {
    paragraphs.push(`When you're ready, check in at ${hotelName(primaryHotel)}.`);
  } else if (primaryHotel && hotelRole === "check-in" && !hasFlights) {
    paragraphs.push(`Check in at ${hotelName(primaryHotel)} when you arrive.`);
  } else if (primaryHotel && hotelRole === "checkout" && hasFlights) {
    paragraphs.push(`Checkout from ${hotelName(primaryHotel)} is today — confirm the time with the property.`);
  }

  for (const reservation of other) {
    paragraphs.push(`You have ${reservation.title || reservation.provider || "something"} on the books.`);
  }

  if (dayReservations.length > 0 && other.length === 0) {
    const mentionsOpen = paragraphs.some((p) => /open|rest of|blank canvas|nothing else scheduled/i.test(p));
    if (!mentionsOpen && (hasFlights || hotelRole === "check-in" || hotelRole === "stay")) {
      paragraphs.push("After that, there's nothing else scheduled — the rest of the day is yours.");
    }
  }

  const summary = paragraphs.length > 1 ? paragraphs[1]! : paragraphs[0] ?? headline;
  return { headline, summary, paragraphs };
}
