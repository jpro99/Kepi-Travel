import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { kvStoreGet } from "@/lib/travelAssistant/kvStore";
import {
  canSignNativeLocationToken,
  NATIVE_LOCATION_TOKEN_TTL_SEC,
  signNativeLocationToken,
} from "@/lib/family/nativeLocationToken";
import { FAMILY_MEMBERSHIP_KEY, resolveFamilyMembership } from "@/lib/family/persistFamilyLocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mint a long-lived token so the native Always tracker can POST while locked. */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSignNativeLocationToken()) {
    return NextResponse.json({ error: "Location token signing is not configured" }, { status: 503 });
  }

  const rawMem = await kvStoreGet<unknown>(FAMILY_MEMBERSHIP_KEY, { userId });
  const mem = resolveFamilyMembership(rawMem, userId);
  const ownerId = mem?.ownerId ?? userId;
  const token = signNativeLocationToken({ userId, ownerId });
  return NextResponse.json({
    token,
    expiresInSec: NATIVE_LOCATION_TOKEN_TTL_SEC,
    ownerId,
  });
}
