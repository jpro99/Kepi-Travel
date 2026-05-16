import { NextResponse } from "next/server";
import { z } from "zod";
import { runTravelUpdateCheck } from "@/lib/travelAssistant/updateAdapters";
import { persistTravelUpdateAudit } from "@/lib/travelAssistant/updateAuditStore";

const ReservationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["flight", "train", "ride", "hotel", "dinner"]),
  title: z.string().min(1),
  confirmationCode: z.string().min(1),
  localTime: z.string().min(1),
  location: z.string().min(1),
  timezone: z.string().min(1),
});

const BodySchema = z.object({
  mode: z.enum(["off", "mock", "auto"]).default("auto"),
  nowIso: z.string().datetime().optional(),
  reservations: z.array(ReservationSchema),
});

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await runTravelUpdateCheck({
    mode: parsed.data.mode,
    reservations: parsed.data.reservations,
    nowIso: parsed.data.nowIso ?? new Date().toISOString(),
  });

  const audit = await persistTravelUpdateAudit({
    result,
    checkedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ...result,
    updates: audit.freshUpdates,
    audit: audit.summary,
  });
}
