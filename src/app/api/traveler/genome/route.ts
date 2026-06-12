import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import {
  applyGenomeCorrection,
  getTravelerGenome,
  saveTravelerGenome,
} from "@/lib/traveler/travelerGenomeStore";
import type { TravelerGenome } from "@/lib/traveler/types";

const CorrectionSchema = z.object({
  override: z.string().trim().min(1),
  context: z.string().trim().default(""),
});

const PutBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    genome: z.custom<TravelerGenome>(),
  }),
  z.object({
    action: z.literal("correct"),
    correction: CorrectionSchema,
  }),
]);

export async function GET() {
  const userId = await resolveAuthenticatedUserId();
  const genome = await getTravelerGenome(userId ?? undefined);
  return NextResponse.json({ genome });
}

export async function PUT(req: Request) {
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

  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === "save") {
    const saved = await saveTravelerGenome(parsed.data.genome, userId ?? undefined);
    return NextResponse.json({ genome: saved });
  }

  const genome = await applyGenomeCorrection(parsed.data.correction, userId ?? undefined);
  return NextResponse.json({ genome });
}
