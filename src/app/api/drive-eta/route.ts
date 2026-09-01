import { NextResponse } from "next/server";
import { getAirportByIata } from "@/lib/travelAssistant/airportGeo";
import { osrmDrivingRoute } from "@/lib/routing/osrm";

/**
 * GET /api/drive-eta?iata=ONT&lat=34.1&lon=-117.5
 * OSRM driving minutes to the airport. Route estimate — not live traffic.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const iata = (url.searchParams.get("iata") ?? "").trim().toUpperCase();
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (!/^[A-Z]{3}$/u.test(iata) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "iata, lat, lon required" }, { status: 400 });
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const airport = getAirportByIata(iata);
  if (!airport) {
    return NextResponse.json({ error: "unknown airport" }, { status: 404 });
  }

  const route = await osrmDrivingRoute(
    { lng: lon, lat },
    { lng: airport.lon, lat: airport.lat },
  );
  if (!route) {
    return NextResponse.json({ error: "route unavailable" }, { status: 502 });
  }

  const driveMinutes = Math.max(1, Math.round(route.durationS / 60));
  return NextResponse.json({
    iata,
    driveMinutes,
    distanceKm: Math.round((route.distanceM / 1000) * 10) / 10,
    source: "osrmDrivingRoute",
    honesty: "route estimate — not live traffic",
  });
}
