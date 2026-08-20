import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { rescanTripImports } from "@/lib/travelAssistant/rescanTripImports";
import { getTrip, updateTrip } from "@/lib/travelAssistant/tripStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  tripId: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "tripId is required." }, { status: 400 });
  }

  const trip = await getTrip(parsed.data.tripId, userId);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  try {
    const result = await rescanTripImports(trip.reservations, { userId });
    const saved = await updateTrip(trip.id, { reservations: result.reservations }, userId);

    return NextResponse.json({
      ok: true,
      rescannedSources: result.rescannedSources,
      updatedReservations: result.updatedReservations,
      pricingUpdatedCount: result.pricingUpdatedCount,
      skippedNoSource: result.skippedNoSource,
      unmatchedDrafts: result.unmatchedDrafts,
      results: result.results,
      pricingDiagnostics: result.pricingDiagnostics ?? [],
      gmailConnected: result.gmailConnected !== false,
      reservations: saved?.reservations ?? result.reservations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Re-scan failed";
    return NextResponse.json(
      { error: `Re-scan failed: ${message}` },
      { status: 500 },
    );
  }
}
