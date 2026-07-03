import { dateOnly, isTripShellConfigured } from "@/lib/travelAssistant/tripWindow";

export interface TripListRowInput {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  reservationCount: number;
}

function isGenericTripName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "my first trip" ||
    normalized === "my trip" ||
    normalized === "new trip" ||
    normalized === "untitled trip" ||
    normalized === "imported trip" ||
    /^trip \d+$/u.test(normalized)
  );
}

function isPlaceholderDestination(destination: string): boolean {
  const normalized = destination.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "set destination" ||
    normalized === "destination pending"
  );
}

function formatShortDate(isoDate: string): string {
  const day = dateOnly(isoDate);
  if (!day) return "Date TBD";
  const ms = Date.parse(`${day}T12:00:00`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatTripDateRange(startDate: string, endDate: string): string {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  if (!start && !end) return "Dates not set";
  if (start && end && start === end) return formatShortDate(start);
  if (start && end) return `${formatShortDate(start)} – ${formatShortDate(end)}`;
  return formatShortDate(start || end);
}

export function formatTripListTitle(trip: Pick<TripListRowInput, "name" | "destination" | "startDate" | "endDate">): string {
  if (isTripShellConfigured(trip) && !isGenericTripName(trip.name)) {
    return trip.name.trim();
  }
  const dates = formatTripDateRange(trip.startDate, trip.endDate);
  if (!isPlaceholderDestination(trip.destination)) {
    return `${trip.destination.trim()} · ${dates}`;
  }
  if (!isGenericTripName(trip.name)) {
    return `${trip.name.trim()} · ${dates}`;
  }
  return dates;
}

export function formatTripListSubtitle(trip: Pick<TripListRowInput, "destination" | "startDate" | "endDate" | "reservationCount">): string {
  const parts: string[] = [formatTripDateRange(trip.startDate, trip.endDate)];
  if (!isPlaceholderDestination(trip.destination)) {
    parts.unshift(trip.destination.trim());
  }
  const bookingLabel =
    trip.reservationCount === 0
      ? "No bookings yet"
      : `${trip.reservationCount} booking${trip.reservationCount === 1 ? "" : "s"}`;
  parts.push(bookingLabel);
  return parts.join(" · ");
}

export function isEmptyTripShell(trip: TripListRowInput): boolean {
  return trip.reservationCount === 0 && !isTripShellConfigured(trip);
}

export function sortTripsForDisplay(trips: TripListRowInput[]): TripListRowInput[] {
  return [...trips].sort((left, right) => {
    const leftStart = dateOnly(left.startDate);
    const rightStart = dateOnly(right.startDate);
    if (leftStart && rightStart && leftStart !== rightStart) {
      return leftStart.localeCompare(rightStart);
    }
    if (leftStart && !rightStart) return -1;
    if (!leftStart && rightStart) return 1;
    return left.createdAt.localeCompare(right.createdAt);
  });
}
