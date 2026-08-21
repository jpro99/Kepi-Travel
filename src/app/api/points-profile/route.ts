import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getPointsTravelProfile, savePointsTravelProfile } from "@/lib/memory/pointsTravelProfile";
import { syncTravelProfileBenefits } from "@/lib/travelAssistant/persistTravelBenefitsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  ownedCards: z
    .array(
      z.object({
        cardId: z.string(),
        label: z.string().optional(),
        lastFour: z.string().max(4).optional(),
      }),
    )
    .optional(),
  usesRakuten: z.boolean().optional(),
  usesChasePortal: z.boolean().optional(),
  earnGoal: z.enum(["maximize_miles", "maximize_cashback", "balanced"]).optional(),
  typicalHotelNightlyUsd: z.number().optional(),
  cardReferralLinks: z.record(z.string(), z.string()).optional(),
  invitationCodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().trim().min(1).max(120),
        code: z.string().trim().min(1).max(240),
        notes: z.string().max(500).optional(),
      }),
    )
    .optional(),
  notes: z.string().optional(),
  cardEnrollments: z
    .record(
      z.string(),
      z.object({
        priorityPassEnrolled: z.boolean().optional(),
        centurionDigitalReady: z.boolean().optional(),
        centurionGuestPassesUsedThisVisit: z.number().int().min(0).max(4).optional(),
        priorityPassNumber: z.string().max(40).optional(),
      }),
    )
    .optional(),
  learnProgress: z.array(z.string()).optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const profile = await getPointsTravelProfile(userId);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not load card wallet",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await getPointsTravelProfile(userId);
  try {
    const saved = await savePointsTravelProfile({ ...existing, ...parsed.data, userId }, userId);
    await syncTravelProfileBenefits(userId).catch(() => null);
    return NextResponse.json({ ok: true, profile: saved });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not save card wallet",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
