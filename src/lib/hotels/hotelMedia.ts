export type HotelGalleryCategory = "property" | "room" | "area" | "other";

export interface HotelGalleryImage {
  url: string;
  caption?: string;
  category: HotelGalleryCategory;
  roomId?: string;
}

export interface HotelRoomPreview {
  id: string;
  name: string;
  description?: string;
  photos: string[];
  sizeLabel?: string;
}

export interface HotelDetailMedia {
  images: HotelGalleryImage[];
  rooms: HotelRoomPreview[];
  description?: string;
}

export function extractLiteApiHotelId(hotelId: string): string | null {
  const match = hotelId.match(/^liteapi-(?:catalog-)?(.+)$/);
  return match?.[1]?.trim() || null;
}

function normalizePhotoUrl(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function categorizeCaption(caption: string | undefined): HotelGalleryCategory {
  const text = (caption ?? "").toLowerCase();
  if (!text) return "property";
  if (/room|suite|bed|bath|shower|king|queen|twin|studio|apartment/.test(text)) return "room";
  if (/city|view|beach|ocean|sea|harbor|harbour|street|neighborhood|neighbourhood|surround|area|landmark|mountain|garden|terrace|balcony/.test(text)) {
    return "area";
  }
  if (/pool|lobby|restaurant|bar|exterior|building|facade|facilities|spa|gym|fitness|breakfast|reception|hotel/.test(text)) {
    return "property";
  }
  return "other";
}

function dedupeImages(images: HotelGalleryImage[]): HotelGalleryImage[] {
  const seen = new Set<string>();
  const kept: HotelGalleryImage[] = [];
  for (const image of images) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    kept.push(image);
  }
  return kept;
}

export function buildGalleryFromUrls(
  urls: string[],
  category: HotelGalleryCategory = "property",
): HotelGalleryImage[] {
  return dedupeImages(
    urls
      .map((url) => normalizePhotoUrl(url))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url, category })),
  );
}

export function mergeHotelDetailMedia(
  fetched: HotelDetailMedia | null,
  fallbackPhotos: string[],
): HotelDetailMedia {
  if (fetched && fetched.images.length > 0) {
    return {
      ...fetched,
      images: dedupeImages([
        ...fetched.images,
        ...buildGalleryFromUrls(fallbackPhotos, "property"),
      ]),
    };
  }
  return {
    images: buildGalleryFromUrls(fallbackPhotos, "property"),
    rooms: [],
    description: fetched?.description,
  };
}

export function parseLiteApiHotelDetailMedia(data: Record<string, unknown>): HotelDetailMedia {
  const images: HotelGalleryImage[] = [];
  const rooms: HotelRoomPreview[] = [];

  for (const raw of (data.hotelImages as Array<Record<string, unknown>> | undefined) ?? []) {
    const url =
      normalizePhotoUrl(raw.urlHd as string | undefined) ??
      normalizePhotoUrl(raw.url as string | undefined) ??
      normalizePhotoUrl(raw.thumbnailUrl as string | undefined);
    if (!url) continue;
    const caption = typeof raw.caption === "string" ? raw.caption : undefined;
    images.push({ url, caption, category: categorizeCaption(caption) });
  }

  if (typeof data.main_photo === "string") {
    const main = normalizePhotoUrl(data.main_photo);
    if (main) images.unshift({ url: main, category: "property", caption: "Main photo" });
  }

  for (const rawRoom of (data.rooms as Array<Record<string, unknown>> | undefined) ?? []) {
    const roomId = String(rawRoom.id ?? rawRoom.roomName ?? rooms.length);
    const name = typeof rawRoom.roomName === "string" ? rawRoom.roomName : "Room";
    const description = typeof rawRoom.description === "string" ? rawRoom.description : undefined;
    const size =
      typeof rawRoom.roomSizeSquare === "number" && typeof rawRoom.roomSizeUnit === "string"
        ? `${rawRoom.roomSizeSquare} ${rawRoom.roomSizeUnit}`
        : undefined;

    const roomPhotos: string[] = [];
    for (const rawPhoto of (rawRoom.photos as Array<Record<string, unknown>> | undefined) ?? []) {
      const url =
        normalizePhotoUrl(rawPhoto.hd_url as string | undefined) ??
        normalizePhotoUrl(rawPhoto.url as string | undefined) ??
        normalizePhotoUrl(rawPhoto.failoverPhoto as string | undefined);
      if (!url || roomPhotos.includes(url)) continue;
      roomPhotos.push(url);
      images.push({
        url,
        caption: name,
        category: "room",
        roomId,
      });
    }

    if (roomPhotos.length > 0 || description) {
      rooms.push({ id: roomId, name, description, photos: roomPhotos, sizeLabel: size });
    }
  }

  const description =
    typeof data.hotelDescription === "string"
      ? data.hotelDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : undefined;

  return {
    images: dedupeImages(images),
    rooms,
    description: description?.slice(0, 600) || undefined,
  };
}
