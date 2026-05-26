import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActiveTrip } from "@/lib/travelAssistant/tripStore";
import { getSafeRedisClient } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARE_TTL = 60 * 60 * 24 * 30; // 30 days

function generateShareToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// POST — create a share token for the active trip
export async function POST(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trip = await getActiveTrip(userId);
  if (!trip) return NextResponse.json({ error: "No active trip" }, { status: 404 });

  // Check if token already exists for this trip
  const existingKey = `share:trip:user:${userId}:${trip.id}`;
  const existingToken = await getSafeRedisClient()?.get(existingKey) as string | null;

  if (existingToken) {
    return NextResponse.json({ token: existingToken, tripName: trip.name });
  }

  const token = generateShareToken();
  const shareKey = `share:trip:${token}`;

  // Store minimal read-only trip snapshot
  const snapshot = {
    tripName: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    reservations: trip.reservations.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      provider: r.provider,
      localTime: r.localTime,
      location: r.location,
      flightNumber: (r as Record<string, unknown>).flightNumber ?? "",
      flightDate: (r as Record<string, unknown>).flightDate ?? "",
      flightDepartureAirport: (r as Record<string, unknown>).flightDepartureAirport ?? "",
      flightArrivalAirport: (r as Record<string, unknown>).flightArrivalAirport ?? "",
      checkOutDate: (r as Record<string, unknown>).checkOutDate ?? "",
    })),
    createdAt: new Date().toISOString(),
  };

  await getSafeRedisClient()?.set(shareKey, JSON.stringify(snapshot), { ex: SHARE_TTL });
  await getSafeRedisClient()?.set(existingKey, token, { ex: SHARE_TTL });

  return NextResponse.json({ token, tripName: trip.name });
}

// DELETE — revoke share token
export async function DELETE(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trip = await getActiveTrip(userId);
  if (!trip) return NextResponse.json({ error: "No active trip" }, { status: 404 });

  const existingKey = `share:trip:user:${userId}:${trip.id}`;
  const token = await getSafeRedisClient()?.get(existingKey) as string | null;

  if (token) {
    await getSafeRedisClient()?.del(`share:trip:${token}`);
    await getSafeRedisClient()?.del(existingKey);
  }

  return NextResponse.json({ revoked: true });
}
