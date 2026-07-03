import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  getHotelStayMemory,
  learnFromHotelEvent,
  saveHotelStayMemory,
  summarizeHotelMemory,
  type HotelMemoryAction,
} from "@/lib/memory/hotelMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostBodySchema = z.object({
  action: z.enum(["saved", "booked", "liked", "dismissed", "searched"]),
  hotelId: z.string().optional(),
  hotelName: z.string().optional(),
  chainName: z.string().optional(),
  city: z.string().min(1),
  nightlyUsd: z.number().optional(),
  stars: z.number().optional(),
  amenities: z.array(z.string()).optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memory = await getHotelStayMemory(userId);
  return NextResponse.json({
    memory,
    summary: summarizeHotelMemory(memory),
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

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const memory = await getHotelStayMemory(userId);
  const updated = learnFromHotelEvent(memory, {
    action: parsed.data.action as HotelMemoryAction,
    hotelId: parsed.data.hotelId,
    hotelName: parsed.data.hotelName,
    chainName: parsed.data.chainName,
    city: parsed.data.city,
    nightlyUsd: parsed.data.nightlyUsd,
    stars: parsed.data.stars,
    amenities: parsed.data.amenities,
  });
  await saveHotelStayMemory(updated, userId);

  return NextResponse.json({
    ok: true,
    summary: summarizeHotelMemory(updated),
  });
}
