import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { getTrip } from "@/lib/travelAssistant/tripStore";
import {
  addTripMemoryComment,
  addTripMemoryPhoto,
  getTripMemoryAlbum,
  removeTripMemoryPhoto,
} from "@/lib/travelAssistant/tripMemoryStore";
import { ingestTripMemoryUpload } from "@/lib/travelAssistant/tripMemoryUpload";
import { generateId } from "@/lib/utils/generateId";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function displayName(userId: string): Promise<string> {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.firstName?.trim() || user.username || "Traveler";
  } catch {
    return "Traveler";
  }
}

export async function GET(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tripId = new URL(req.url).searchParams.get("tripId")?.trim() ?? "";
  if (!tripId) {
    return NextResponse.json({ error: "tripId is required." }, { status: 400 });
  }

  const trip = await getTrip(tripId, userId);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const album = await getTripMemoryAlbum(userId, tripId);
  return NextResponse.json({ album, role: "owner" as const });
}

export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const action = String(formData.get("action") ?? "upload-photo");
  const tripId = String(formData.get("tripId") ?? "").trim();
  if (!tripId) {
    return NextResponse.json({ error: "tripId is required." }, { status: 400 });
  }

  const trip = await getTrip(tripId, userId);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  if (action === "comment") {
    const photoId = String(formData.get("photoId") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (!photoId || !body) {
      return NextResponse.json({ error: "photoId and body are required." }, { status: 400 });
    }
    const comment = await addTripMemoryComment(userId, {
      tripId,
      photoId,
      authorName: await displayName(userId),
      authorUserId: userId,
      body,
    });
    if (!comment) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }
    return NextResponse.json({ comment });
  }

  const upload = formData.get("file");
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Photo file is required." }, { status: 400 });
  }

  const caption = String(formData.get("caption") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "photo");
  const kind = kindRaw === "collage" ? "collage" : "photo";
  let collageSourcePhotoIds: string[] | undefined;
  const rawPhotoIds = String(formData.get("photoIds") ?? "");
  if (rawPhotoIds && kind === "collage") {
    try {
      const parsed = JSON.parse(rawPhotoIds) as unknown;
      if (Array.isArray(parsed)) {
        collageSourcePhotoIds = parsed.filter((id): id is string => typeof id === "string");
      }
    } catch {
      collageSourcePhotoIds = undefined;
    }
  }

  const photoId = generateId();
  const bytes = Buffer.from(await upload.arrayBuffer());

  let stored: { imageUrl: string; printImageUrl?: string };
  try {
    stored = await ingestTripMemoryUpload({
      ownerUserId: userId,
      tripId,
      photoId,
      bytes,
      fileName: upload.name,
      declaredType: upload.type,
      kind,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not process photo." },
      { status: 422 },
    );
  }

  const photo = await addTripMemoryPhoto(userId, {
    id: photoId,
    tripId,
    imageUrl: stored.imageUrl,
    printImageUrl: stored.printImageUrl,
    caption,
    uploadedByUserId: userId,
    uploadedByName: await displayName(userId),
    kind,
    collageSourcePhotoIds,
  });

  return NextResponse.json({ photo });
}

export async function DELETE(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tripId?: string; photoId?: string };
  try {
    body = (await req.json()) as { tripId?: string; photoId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const tripId = body.tripId?.trim() ?? "";
  const photoId = body.photoId?.trim() ?? "";
  if (!tripId || !photoId) {
    return NextResponse.json({ error: "tripId and photoId are required." }, { status: 400 });
  }

  const trip = await getTrip(tripId, userId);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const removed = await removeTripMemoryPhoto(userId, tripId, photoId);
  if (!removed) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
