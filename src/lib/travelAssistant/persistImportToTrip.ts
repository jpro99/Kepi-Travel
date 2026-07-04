export interface ImportTripReservationMeta {
  type: string;
  localTime: string;
  flightArrivalAirport?: string;
  flightDepartureAirport?: string;
  location?: string;
  title?: string;
}

export function inferImportedTripMeta(reservations: ImportTripReservationMeta[]): {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
} {
  const flights = reservations.filter((reservation) => reservation.type === "flight");
  const hotels = reservations.filter((reservation) => reservation.type === "hotel");
  const dates = reservations
    .map((reservation) => reservation.localTime.trim().slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/u.test(date))
    .sort();
  const today = new Date().toISOString().slice(0, 10);
  const startDate = dates[0] ?? today;
  const endDate = dates[dates.length - 1] ?? startDate;
  const lastFlight = flights[flights.length - 1];
  const destination =
    lastFlight?.flightArrivalAirport?.trim().toUpperCase() ||
    hotels[0]?.location?.trim() ||
    lastFlight?.title?.trim() ||
    flights[0]?.flightArrivalAirport?.trim().toUpperCase() ||
    "Trip";
  const name =
    destination.length === 3
      ? `Trip to ${destination}`
      : destination !== "Trip"
        ? destination.slice(0, 120)
        : "Imported trip";
  return { name, destination, startDate, endDate };
}
