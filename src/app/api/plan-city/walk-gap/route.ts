import { NextResponse } from "next/server";
import { z } from "zod";
import { getFootRoute } from "@/lib/routing/walkingRouter";

const bodySchema = z.object({
  from: z.object({ lat: z.number(), lng: z.number() }),
  to: z.object({ lat: z.number(), lng: z.number() }),
  fromStopId: z.string().optional(),
  toStopId: z.string().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid walk-gap payload" }, { status: 400 });
  }

  const leg = await getFootRoute(parsed.from, parsed.to);
  if (!leg) {
    return NextResponse.json({
      fromStopId: parsed.fromStopId ?? null,
      toStopId: parsed.toStopId ?? null,
      distanceM: null,
      durationSec: null,
      routingSource: "none",
      unavailable: true,
    });
  }

  return NextResponse.json({
    fromStopId: parsed.fromStopId ?? null,
    toStopId: parsed.toStopId ?? null,
    distanceM: leg.distanceM,
    durationSec: leg.durationS,
    routingSource: leg.source,
    unavailable: false,
  });
}
