import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { persistFamilyMemberLocation } from "@/lib/family/persistFamilyLocation";
import { readBearerToken, verifyNativeLocationToken } from "@/lib/family/nativeLocationToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Background iOS Always tracker — Clerk cookies are not available when locked. */
export async function POST(request: Request) {
  const token = readBearerToken(request.headers.get("authorization"));
  const payload = token ? verifyNativeLocationToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      accuracy: z.number().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await persistFamilyMemberLocation({
    memberId: payload.userId,
    ownerNamespace: payload.ownerId,
    lat: parsed.data.lat,
    lon: parsed.data.lon,
    accuracy: parsed.data.accuracy,
  });
  return NextResponse.json(result);
}
