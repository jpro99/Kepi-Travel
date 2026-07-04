import { processTripMemoryPhotoBytes } from "@/lib/travelAssistant/tripMemoryImageProcess";
import {
  inferTripPhotoMime,
  isLikelyTripPhotoFile,
  TRIP_PHOTO_MAX_UPLOAD_BYTES,
} from "@/lib/travelAssistant/tripMemoryImageTypes";
import { storeTripPhotoBytes, storeTripPhotoVariants } from "@/lib/travelAssistant/tripMemoryMedia";

export async function ingestTripMemoryUpload(args: {
  ownerUserId: string;
  tripId: string;
  photoId: string;
  bytes: Buffer;
  fileName: string;
  declaredType: string;
  kind: "photo" | "collage";
}): Promise<{ imageUrl: string; printImageUrl?: string }> {
  if (args.bytes.length <= 0 || args.bytes.length > TRIP_PHOTO_MAX_UPLOAD_BYTES) {
    throw new Error(`Photo must be under ${Math.round(TRIP_PHOTO_MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`);
  }

  const inferredMime = inferTripPhotoMime(args.fileName, args.declaredType, args.bytes);
  if (!isLikelyTripPhotoFile(args.fileName, inferredMime)) {
    throw new Error("Upload a photo from your camera roll (JPEG, HEIC, PNG, or WebP).");
  }

  if (args.kind === "collage") {
    const imageUrl = await storeTripPhotoBytes({
      ownerUserId: args.ownerUserId,
      tripId: args.tripId,
      photoId: args.photoId,
      bytes: args.bytes,
      contentType: "image/jpeg",
      variant: "display",
    });
    return { imageUrl };
  }

  try {
    const processed = await processTripMemoryPhotoBytes(args.bytes);
    return storeTripPhotoVariants({
      ownerUserId: args.ownerUserId,
      tripId: args.tripId,
      photoId: args.photoId,
      displayBytes: processed.displayBytes,
      printBytes: processed.printBytes,
      contentType: processed.contentType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process photo.";
    throw new Error(message);
  }
}
