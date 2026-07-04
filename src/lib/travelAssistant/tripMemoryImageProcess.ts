import sharp from "sharp";
import {
  TRIP_PHOTO_DISPLAY_JPEG_QUALITY,
  TRIP_PHOTO_DISPLAY_MAX_EDGE,
  TRIP_PHOTO_PRINT_JPEG_QUALITY,
  TRIP_PHOTO_PRINT_MAX_EDGE,
} from "@/lib/travelAssistant/tripMemoryImageTypes";

export interface ProcessedTripPhotoVariants {
  displayBytes: Buffer;
  printBytes: Buffer;
  contentType: "image/jpeg";
  width: number;
  height: number;
}

/** Normalize phone photos (HEIC/JPEG/PNG/WebP) into display + print JPEG variants. */
export async function processTripMemoryPhotoBytes(input: Buffer): Promise<ProcessedTripPhotoVariants> {
  const pipeline = sharp(input, { failOn: "none", animated: true }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read this photo. Try saving as JPEG and upload again.");
  }

  const displayBytes = await sharp(input, { failOn: "none", animated: true })
    .rotate()
    .resize(TRIP_PHOTO_DISPLAY_MAX_EDGE, TRIP_PHOTO_DISPLAY_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: TRIP_PHOTO_DISPLAY_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const printBytes = await sharp(input, { failOn: "none", animated: true })
    .rotate()
    .resize(TRIP_PHOTO_PRINT_MAX_EDGE, TRIP_PHOTO_PRINT_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: TRIP_PHOTO_PRINT_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const printMeta = await sharp(printBytes).metadata();

  return {
    displayBytes,
    printBytes,
    contentType: "image/jpeg",
    width: printMeta.width ?? metadata.width,
    height: printMeta.height ?? metadata.height,
  };
}
