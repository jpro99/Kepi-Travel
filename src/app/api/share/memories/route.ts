import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  addTripMemoryComment,
  getTripMemoryAlbum,
} from "@/lib/travelAssistant/tripMemoryStore";
import {
  resolveOwnerFromShareToken,
  resolveTripMemoryAccess,
} from "@/lib/travelAssistant/tripMemoryAccess";

export const runtime = "nodejs";

async function viewerDisplayName(userId: string | null, fallback?: string): Promise<string> {
  if (fallback?.trim()) return fallback.trim();
  if (!userId) return "Guest";
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.firstName?.trim() || user.username || "Guest";
  } catch {
    return "Guest";
  }
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  const resolved = await resolveOwnerFromShareToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid or expired share link." }, { status: 404 });
  }

  const { userId } = await auth();
  const access = await resolveTripMemoryAccess({
    ownerUserId: resolved.ownerUserId,
    tripId: resolved.tripId,
    requesterUserId: userId,
    shareToken: token,
  });
  if (access === "none") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const album = await getTripMemoryAlbum(resolved.ownerUserId, resolved.tripId);
  return NextResponse.json({
    album,
    role: access,
    tripId: resolved.tripId,
  });
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  let body: { photoId?: string; comment?: string; authorName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const photoId = body.photoId?.trim() ?? "";
  const comment = body.comment?.trim() ?? "";
  if (!photoId || !comment) {
    return NextResponse.json({ error: "photoId and comment are required." }, { status: 400 });
  }

  const resolved = await resolveOwnerFromShareToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid or expired share link." }, { status: 404 });
  }

  const { userId } = await auth();
  const access = await resolveTripMemoryAccess({
    ownerUserId: resolved.ownerUserId,
    tripId: resolved.tripId,
    requesterUserId: userId,
    shareToken: token,
  });
  if (access === "none") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const saved = await addTripMemoryComment(resolved.ownerUserId, {
    tripId: resolved.tripId,
    photoId,
    authorName: await viewerDisplayName(userId, body.authorName),
    authorUserId: userId ?? undefined,
    body: comment,
  });
  if (!saved) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }
  return NextResponse.json({ comment: saved });
}
