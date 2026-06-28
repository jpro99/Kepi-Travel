import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { fetchLiteApiHotelDetails } from "@/lib/providers/liteapi/hotelDetails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const QuerySchema = z.object({
  hotelId: z.string().min(1).max(64),
});

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ hotelId: url.searchParams.get("hotelId") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hotelId" }, { status: 400 });
  }

  const result = await fetchLiteApiHotelDetails(parsed.data.hotelId);
  if (!result.media) {
    return NextResponse.json({ error: result.error ?? "No details" }, { status: 404 });
  }

  return NextResponse.json(result.media);
}
