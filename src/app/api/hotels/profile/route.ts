import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { mergeStayProfile, parseStayProfileText } from "@/lib/hotels/parseStayProfileText";
import {
  getHotelStayProfile,
  saveHotelStayProfile,
  summarizeHotelStayProfile,
  type BreakfastPreference,
  type HotelQualityFloor,
} from "@/lib/memory/hotelStayProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProfilePatchSchema = z.object({
  freeTextSummary: z.string().optional(),
  requiresElevator: z.boolean().optional(),
  avoidStairs: z.boolean().optional(),
  prefersBalcony: z.boolean().optional(),
  prefersOceanView: z.boolean().optional(),
  prefersNearTransit: z.boolean().optional(),
  prefersCentralArea: z.boolean().optional(),
  prefersBreakfast: z.enum(["required", "nice_to_have", "dont_care"]).optional(),
  qualityFloor: z.enum(["budget", "mid", "high", "luxury"]).optional(),
  completed: z.boolean().optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getHotelStayProfile(userId);
  return NextResponse.json({
    profile,
    summary: summarizeHotelStayProfile(profile),
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

  const parsed = ProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await getHotelStayProfile(userId);
  const fromText = parsed.data.freeTextSummary
    ? parseStayProfileText(parsed.data.freeTextSummary)
    : {};

  const merged = mergeStayProfile(existing, {
    ...fromText,
    ...parsed.data,
    prefersBreakfast: parsed.data.prefersBreakfast as BreakfastPreference | undefined,
    qualityFloor: parsed.data.qualityFloor as HotelQualityFloor | undefined,
  });

  const saved = await saveHotelStayProfile(merged, userId);
  return NextResponse.json({
    ok: true,
    profile: saved,
    summary: summarizeHotelStayProfile(saved),
  });
}
