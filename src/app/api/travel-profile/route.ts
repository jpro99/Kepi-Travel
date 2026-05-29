import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { enforceRateLimit } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_KEY = "travel-profile:v1";

const AirlineStatusSchema = z.object({
  airline: z.string().min(1).max(60),
  program: z.string().max(80).optional(),
  tier: z.string().min(1).max(60),
  iata: z.string().max(4).optional(),
});

const HotelStatusSchema = z.object({
  chain: z.string().min(1).max(60),
  tier: z.string().min(1).max(60),
  number: z.string().max(40).optional(),
});

const CarRentalStatusSchema = z.object({
  company: z.string().min(1).max(60),
  tier: z.string().min(1).max(60),
});

const TravelProfileSchema = z.object({
  airlineStatuses: z.array(AirlineStatusSchema).max(10),
  hotelStatuses: z.array(HotelStatusSchema).max(10).optional(),
  carRentalStatuses: z.array(CarRentalStatusSchema).max(5).optional(),
  tsa_precheck: z.boolean().optional(),
  global_entry: z.boolean().optional(),
  clear: z.boolean().optional(),
  updatedAt: z.string().optional(),
});

export type TravelProfile = z.infer<typeof TravelProfileSchema>;

async function authorize(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const { userId } = await auth();
  if (!userId) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const rateLimit = await enforceRateLimit({ policyName: "travel-updates-general", identifier: userId, route: "/api/travel-profile", requestId });
  if (!rateLimit.allowed) return { ok: false as const, response: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  return { ok: true as const, userId };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  const profile = await kvStoreGet<TravelProfile>(PROFILE_KEY, { userId: auth.userId });
  return NextResponse.json({ profile: profile ?? { airlineStatuses: [] } });
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = TravelProfileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const profile: TravelProfile = { ...parsed.data, updatedAt: new Date().toISOString() };
  await kvStoreSet(PROFILE_KEY, profile, { userId: auth.userId });
  return NextResponse.json({ ok: true, profile });
}
