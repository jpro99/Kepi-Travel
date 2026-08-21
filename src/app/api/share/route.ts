
import { NextResponse } from 'next/server';

// This endpoint used to return a hardcoded "Trip to Tokyo" memory (fake moments in
// Shinjuku/Shibuya/Hakone/Ginza) whenever tripId === "1", regardless of the requester's
// actual trip. There is no real trip-memory generation behind this route (the live trip
// photo/memory feature lives at /api/share/memories and /api/trips/memories instead), so
// rather than fabricate content for one magic tripId we return an honest "not available"
// response for every request.
// TODO(product decision): either remove this route in favor of /api/share/memories, or
// wire it to a real per-trip memory summary if this shape is still needed somewhere.
export async function POST(request: Request) {
    const { tripId } = await request.json() as { tripId?: string };
    void tripId;

    return NextResponse.json(
        { error: 'Trip memories are not available yet.' },
        { status: 501 },
    );
}
