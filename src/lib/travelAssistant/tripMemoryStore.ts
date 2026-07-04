import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";

const ALBUM_KEY = (tripId: string) => `trip-memories:${tripId}`;

export interface TripMemoryPhoto {
  id: string;
  tripId: string;
  imageUrl: string;
  caption: string;
  uploadedByUserId: string;
  uploadedByName: string;
  uploadedAt: string;
  kind: "photo" | "collage";
  /** Source photo ids when kind=collage */
  collageSourcePhotoIds?: string[];
  /** Higher-resolution JPEG for owner print/download */
  printImageUrl?: string;
}

export interface TripMemoryComment {
  id: string;
  photoId: string;
  authorName: string;
  authorUserId?: string;
  body: string;
  createdAt: string;
}

export interface TripMemoryAlbum {
  tripId: string;
  photos: TripMemoryPhoto[];
  comments: TripMemoryComment[];
  collageUrl: string | null;
  collageCreatedAt: string | null;
}

function emptyAlbum(tripId: string): TripMemoryAlbum {
  return {
    tripId,
    photos: [],
    comments: [],
    collageUrl: null,
    collageCreatedAt: null,
  };
}

function sanitizePhoto(raw: unknown): TripMemoryPhoto | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<TripMemoryPhoto>;
  if (
    typeof p.id !== "string" ||
    typeof p.tripId !== "string" ||
    typeof p.imageUrl !== "string" ||
    typeof p.uploadedByUserId !== "string" ||
    typeof p.uploadedAt !== "string"
  ) {
    return null;
  }
  return {
    id: p.id,
    tripId: p.tripId,
    imageUrl: p.imageUrl,
    caption: typeof p.caption === "string" ? p.caption : "",
    uploadedByUserId: p.uploadedByUserId,
    uploadedByName: typeof p.uploadedByName === "string" ? p.uploadedByName : "Traveler",
    uploadedAt: p.uploadedAt,
    kind: p.kind === "collage" ? "collage" : "photo",
    collageSourcePhotoIds: Array.isArray(p.collageSourcePhotoIds)
      ? p.collageSourcePhotoIds.filter((id): id is string => typeof id === "string")
      : undefined,
    printImageUrl: typeof p.printImageUrl === "string" ? p.printImageUrl : undefined,
  };
}

function sanitizeComment(raw: unknown): TripMemoryComment | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<TripMemoryComment>;
  if (
    typeof c.id !== "string" ||
    typeof c.photoId !== "string" ||
    typeof c.authorName !== "string" ||
    typeof c.body !== "string" ||
    typeof c.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: c.id,
    photoId: c.photoId,
    authorName: c.authorName,
    authorUserId: typeof c.authorUserId === "string" ? c.authorUserId : undefined,
    body: c.body,
    createdAt: c.createdAt,
  };
}

function sanitizeAlbum(raw: unknown, tripId: string): TripMemoryAlbum {
  if (!raw || typeof raw !== "object") return emptyAlbum(tripId);
  const a = raw as Partial<TripMemoryAlbum>;
  return {
    tripId,
    photos: Array.isArray(a.photos) ? a.photos.map(sanitizePhoto).filter(Boolean) as TripMemoryPhoto[] : [],
    comments: Array.isArray(a.comments)
      ? a.comments.map(sanitizeComment).filter(Boolean) as TripMemoryComment[]
      : [],
    collageUrl: typeof a.collageUrl === "string" ? a.collageUrl : null,
    collageCreatedAt: typeof a.collageCreatedAt === "string" ? a.collageCreatedAt : null,
  };
}

export async function getTripMemoryAlbum(ownerUserId: string, tripId: string): Promise<TripMemoryAlbum> {
  const stored = await kvStoreGet<unknown>(ALBUM_KEY(tripId), { userId: ownerUserId });
  return sanitizeAlbum(stored, tripId);
}

async function saveTripMemoryAlbum(
  ownerUserId: string,
  album: TripMemoryAlbum,
): Promise<TripMemoryAlbum> {
  await kvStoreSet(ALBUM_KEY(album.tripId), album, { userId: ownerUserId });
  return album;
}

export async function addTripMemoryPhoto(
  ownerUserId: string,
  input: {
    id?: string;
    tripId: string;
    imageUrl: string;
    caption?: string;
    uploadedByUserId: string;
    uploadedByName: string;
    kind?: "photo" | "collage";
    collageSourcePhotoIds?: string[];
    printImageUrl?: string;
  },
): Promise<TripMemoryPhoto> {
  const album = await getTripMemoryAlbum(ownerUserId, input.tripId);
  const photo: TripMemoryPhoto = {
    id: input.id?.trim() || generateId(),
    tripId: input.tripId,
    imageUrl: input.imageUrl,
    caption: input.caption?.trim() ?? "",
    uploadedByUserId: input.uploadedByUserId,
    uploadedByName: input.uploadedByName.trim() || "Traveler",
    uploadedAt: new Date().toISOString(),
    kind: input.kind ?? "photo",
    collageSourcePhotoIds: input.collageSourcePhotoIds?.length
      ? input.collageSourcePhotoIds
      : undefined,
    printImageUrl: input.printImageUrl,
  };
  album.photos.unshift(photo);
  if (photo.kind === "collage") {
    album.collageUrl = photo.imageUrl;
    album.collageCreatedAt = photo.uploadedAt;
  }
  await saveTripMemoryAlbum(ownerUserId, album);
  return photo;
}

export async function removeTripMemoryPhoto(
  ownerUserId: string,
  tripId: string,
  photoId: string,
): Promise<boolean> {
  const album = await getTripMemoryAlbum(ownerUserId, tripId);
  const nextPhotos = album.photos.filter((photo) => photo.id !== photoId);
  if (nextPhotos.length === album.photos.length) return false;
  album.photos = nextPhotos;
  album.comments = album.comments.filter((comment) => comment.photoId !== photoId);
  if (album.collageUrl && !nextPhotos.some((p) => p.imageUrl === album.collageUrl)) {
    album.collageUrl = null;
    album.collageCreatedAt = null;
  }
  await saveTripMemoryAlbum(ownerUserId, album);
  return true;
}

export async function addTripMemoryComment(
  ownerUserId: string,
  input: {
    tripId: string;
    photoId: string;
    authorName: string;
    authorUserId?: string;
    body: string;
  },
): Promise<TripMemoryComment | null> {
  const album = await getTripMemoryAlbum(ownerUserId, input.tripId);
  if (!album.photos.some((photo) => photo.id === input.photoId)) return null;
  const comment: TripMemoryComment = {
    id: generateId(),
    photoId: input.photoId,
    authorName: input.authorName.trim() || "Guest",
    authorUserId: input.authorUserId,
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  };
  if (!comment.body) return null;
  album.comments.push(comment);
  await saveTripMemoryAlbum(ownerUserId, album);
  return comment;
}
