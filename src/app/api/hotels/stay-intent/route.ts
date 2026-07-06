import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  getTripHotelStayIntent,
  recordSegmentStayDecision,
  stayDecisionsMap,
} from "@/lib/memory/hotelStayIntent";
import { getTrip, updateTrip } from "@/lib/travelAssistant/tripStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DecisionSchema = z.object({
  tripId: z.string().min(1),
  segmentId: z.string().min(1),
  intent: z.enum(["needs_hotel", "skip"]),
  city: z.string().optional(),
  stopKind: z.enum(["connection", "overnight_layover", "destination"]).optional(),
});

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tripId = new URL(req.url).searchParams.get("tripId")?.trim() ?? "";
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const record = await getTripHotelStayIntent(userId, tripId);
  const trip = await getTrip(tripId, userId);
  const decisions = {
    ...stayDecisionsMap(record),
    ...(trip?.stayDecisions ?? {}),
  };
  return NextResponse.json({
    record,
    decisions,
    usuallySkipsConnections: record.travelStyle.usuallySkipsConnections,
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const record = await recordSegmentStayDecision({
    userId,
    tripId: parsed.data.tripId,
    segmentId: parsed.data.segmentId,
    intent: parsed.data.intent,
    city: parsed.data.city,
    stopKind: parsed.data.stopKind,
  });

  const decisions = stayDecisionsMap(record);
  try {
    await updateTrip(
      parsed.data.tripId,
      {
        stayDecisions: {
          [parsed.data.segmentId]: parsed.data.intent,
        },
      },
      userId,
    );
  } catch {
    /* trip patch is best-effort; KV record still saved */
  }

  return NextResponse.json({
    ok: true,
    record,
    decisions,
    usuallySkipsConnections: record.travelStyle.usuallySkipsConnections,
  });
}
