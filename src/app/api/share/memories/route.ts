import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { addTripMemoryComment, addTripMemoryPhoto, getTripMemoryAlbum } from "@/lib/travelAssistant/tripMemoryStore";
import { ingestTripMemoryUpload } from "@/lib/travelAssistant/tripMemoryUpload";
import {
  resolveOwnerFromShareToken,
  resolveTripMemoryAccess,
} from "@/lib/travelAssistant/tripMemoryAccess";
import { assertShareViewerEmailAccess } from "@/lib/travelAssistant/tripShareAccess";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_COLLAGE_BYTES = 8 * 1024 * 1024;

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

async function authorizeShareToken(token: string) {
  const resolved = await resolveOwnerFromShareToken(token);
  if (!resolved) return null;
  const { userId } = await auth();
  const emailOk = await assertShareViewerEmailAccess(token, userId);
  if (!emailOk) return null;
  const access = await resolveTripMemoryAccess({
    ownerUserId: resolved.ownerUserId,
    tripId: resolved.tripId,
    requesterUserId: userId,
    shareToken: token,
  });
  if (access === "none") return null;
  return { resolved, userId, access };
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  const authResult = await authorizeShareToken(token);
  if (!authResult) {
    return NextResponse.json({ error: "Invalid or expired share link." }, { status: 404 });
  }

  const album = await getTripMemoryAlbum(authResult.resolved.ownerUserId, authResult.resolved.tripId);
  return NextResponse.json({
    album,
    role: authResult.access,
    tripId: authResult.resolved.tripId,
  });
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  const authResult = await authorizeShareToken(token);
  if (!authResult) {
    return NextResponse.json({ error: "Invalid or expired share link." }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
    }

    const action = String(formData.get("action") ?? "");
    if (action !== "collage") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const upload = formData.get("file");
    if (!(upload instanceof File)) {
      return NextResponse.json({ error: "Collage file is required." }, { status: 400 });
    }
    if (upload.size <= 0 || upload.size > MAX_COLLAGE_BYTES) {
      return NextResponse.json({ error: "Collage must be under 8MB." }, { status: 413 });
    }

    const authorName = await viewerDisplayName(
      authResult.userId,
      String(formData.get("authorName") ?? ""),
    );
    let sourcePhotoIds: string[] = [];
    const rawIds = String(formData.get("photoIds") ?? "");
    if (rawIds) {
      try {
        const parsed = JSON.parse(rawIds) as unknown;
        if (Array.isArray(parsed)) {
          sourcePhotoIds = parsed.filter((id): id is string => typeof id === "string");
        }
      } catch {
        sourcePhotoIds = [];
      }
    }

    const album = await getTripMemoryAlbum(
      authResult.resolved.ownerUserId,
      authResult.resolved.tripId,
    );
    const validIds = new Set(album.photos.filter((p) => p.kind === "photo").map((p) => p.id));
    sourcePhotoIds = sourcePhotoIds.filter((id) => validIds.has(id));

    const photoId = generateId();
    const bytes = Buffer.from(await upload.arrayBuffer());
    let stored: { imageUrl: string; printImageUrl?: string };
    try {
      stored = await ingestTripMemoryUpload({
        ownerUserId: authResult.resolved.ownerUserId,
        tripId: authResult.resolved.tripId,
        photoId,
        bytes,
        fileName: upload.name || "keepsake.jpg",
        declaredType: upload.type || "image/jpeg",
        kind: "collage",
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not save collage." },
        { status: 422 },
      );
    }

    const photo = await addTripMemoryPhoto(authResult.resolved.ownerUserId, {
      id: photoId,
      tripId: authResult.resolved.tripId,
      imageUrl: stored.imageUrl,
      caption: `Keepsake by ${authorName}${sourcePhotoIds.length ? ` · ${sourcePhotoIds.length} photos` : ""}`,
      uploadedByUserId: authResult.userId ?? `guest:${authorName}`,
      uploadedByName: authorName,
      kind: "collage",
      collageSourcePhotoIds: sourcePhotoIds.length ? sourcePhotoIds : undefined,
    });

    return NextResponse.json({ photo });
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

  const saved = await addTripMemoryComment(authResult.resolved.ownerUserId, {
    tripId: authResult.resolved.tripId,
    photoId,
    authorName: await viewerDisplayName(authResult.userId, body.authorName),
    authorUserId: authResult.userId ?? undefined,
    body: comment,
  });
  if (!saved) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }
  return NextResponse.json({ comment: saved });
}
