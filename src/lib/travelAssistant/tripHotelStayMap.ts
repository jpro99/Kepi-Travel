import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import { deriveHotelSearchCityFromReservation } from "@/lib/hotels/hotelReservationCity";
import { resolveHotelDestinationSync } from "@/lib/hotels/resolveDestination";
import { isPlannedReservation } from "@/lib/travelAssistant/plannedReservationMatch";
import type { PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";

export interface HotelStayMapReservation {
  id: string;
  type?: string;
  title?: string;
  provider?: string;
  location?: string;
  localTime?: string;
  checkOutDate?: string;
  confirmationCode?: string | null;
  plannedOnly?: boolean;
  hotelSearchCity?: string;
}

export interface HotelStayMapPoint {
  id: string;
  label: string;
  city: string;
  lat: number;
  lon: number;
  booked: boolean;
  checkIn: string;
  checkOut: string;
  dateLabel: string;
  reservationId?: string;
  segmentId?: string;
  sortKey: string;
}

export const HOTEL_STAY_SOURCE = "trip-hotel-stays";
export const HOTEL_STAY_LINE_SOURCE = "trip-hotel-stay-lines";

function fmtDateShort(iso: string): string {
  const slice = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slice)) return iso;
  return new Date(`${slice}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function resolveStayCoords(cityQuery: string): { lat: number; lon: number; city: string } | null {
  const resolved = resolveHotelDestinationSync(cityQuery);
  if (!resolved) return null;
  return { lat: resolved.lat, lon: resolved.lng, city: resolved.displayName };
}

function cityKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function reservationBooked(reservation: HotelStayMapReservation): boolean {
  return !isPlannedReservation({ ...reservation, type: reservation.type ?? "hotel" });
}

function pointFromReservation(reservation: HotelStayMapReservation): HotelStayMapPoint | null {
  const enriched = {
    id: reservation.id,
    title: reservation.title,
    provider: reservation.provider,
    location: reservation.location,
    localTime: reservation.localTime,
    checkOutDate: reservation.checkOutDate,
    hotelSearchCity: reservation.hotelSearchCity,
  };
  const cityQuery =
    reservation.hotelSearchCity?.trim() ||
    deriveHotelSearchCityFromReservation(enriched) ||
    reservation.location?.trim() ||
    reservation.title?.trim() ||
    "";
  const coords = resolveStayCoords(cityQuery);
  if (!coords) return null;

  const checkIn = reservation.localTime?.slice(0, 10) ?? "";
  const checkOut = reservation.checkOutDate?.slice(0, 10) ?? checkIn;
  const booked = reservationBooked(reservation);

  return {
    id: reservation.id,
    label: reservation.title?.trim() || coords.city,
    city: coords.city,
    lat: coords.lat,
    lon: coords.lon,
    booked,
    checkIn,
    checkOut,
    dateLabel: checkIn ? fmtDateShort(checkIn) : "",
    reservationId: reservation.id,
    sortKey: `${checkIn || "9999-99-99"}T00:00`,
  };
}

function pointFromStaySegment(segment: TripStaySegment): HotelStayMapPoint | null {
  if (segment.status === "booked" || segment.status === "skipped") return null;
  const coords = resolveStayCoords(segment.cityIata?.trim() || segment.city);
  if (!coords) return null;

  return {
    id: segment.id,
    label: segment.label || coords.city,
    city: coords.city,
    lat: coords.lat,
    lon: coords.lon,
    booked: false,
    checkIn: segment.checkIn,
    checkOut: segment.checkOut,
    dateLabel: fmtDateShort(segment.checkIn),
    segmentId: segment.id,
    sortKey: `${segment.checkIn}T00:00`,
  };
}

function pointFromPlannedCity(city: PlannedStayCity): HotelStayMapPoint | null {
  if (city.status === "booked") return null;
  const coords = resolveStayCoords(city.cityIata?.trim() || city.city);
  if (!coords) return null;

  return {
    id: city.id,
    label: city.hotelName?.trim() || coords.city,
    city: coords.city,
    lat: coords.lat,
    lon: coords.lon,
    booked: false,
    checkIn: city.checkIn,
    checkOut: city.checkOut,
    dateLabel: fmtDateShort(city.checkIn),
    segmentId: city.id,
    sortKey: `${city.checkIn}T00:00`,
  };
}

function overlapsExisting(point: HotelStayMapPoint, existing: HotelStayMapPoint[]): boolean {
  return existing.some(
    (other) =>
      cityKey(other.city) === cityKey(point.city) &&
      other.checkIn === point.checkIn &&
      other.checkOut === point.checkOut,
  );
}

export function buildHotelStayMapPoints(input: {
  reservations: HotelStayMapReservation[];
  staySegments?: TripStaySegment[];
  plannedStayCities?: PlannedStayCity[];
}): HotelStayMapPoint[] {
  const points: HotelStayMapPoint[] = [];

  for (const reservation of input.reservations) {
    if (reservation.type && reservation.type !== "hotel") continue;
    const point = pointFromReservation(reservation);
    if (point) points.push(point);
  }

  for (const city of input.plannedStayCities ?? []) {
    const point = pointFromPlannedCity(city);
    if (point && !overlapsExisting(point, points)) points.push(point);
  }

  return points.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.label.localeCompare(b.label));
}

export function buildHotelStayLineGeoJson(points: HotelStayMapPoint[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    const booked = prev.booked && next.booked;
    features.push({
      type: "Feature",
      id: `${prev.id}-${next.id}`,
      properties: {
        booked,
        color: booked ? "#22c55e" : "#64748b",
        dashed: !booked,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [prev.lon, prev.lat],
          [next.lon, next.lat],
        ],
      },
    });
  }

  return { type: "FeatureCollection", features };
}

export function buildHotelStayPointGeoJson(points: HotelStayMapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      id: point.id,
      properties: {
        stayId: point.id,
        label: point.label,
        city: point.city,
        booked: point.booked,
        color: point.booked ? "#22c55e" : "#64748b",
        dateLabel: point.dateLabel,
      },
      geometry: {
        type: "Point",
        coordinates: [point.lon, point.lat],
      },
    })),
  };
}

export function hotelStayStrokeColor(booked: boolean): string {
  return booked ? "#22c55e" : "#64748b";
}
