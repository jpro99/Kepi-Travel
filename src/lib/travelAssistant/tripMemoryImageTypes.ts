export const TRIP_PHOTO_DISPLAY_MAX_EDGE = 1600;
export const TRIP_PHOTO_PRINT_MAX_EDGE = 3200;
export const TRIP_PHOTO_DISPLAY_JPEG_QUALITY = 82;
export const TRIP_PHOTO_PRINT_JPEG_QUALITY = 90;
/** Max upload before server processing (HEIC / phone originals). */
export const TRIP_PHOTO_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Client pre-upload cap — keeps upload fast on cellular. */
export const TRIP_PHOTO_CLIENT_UPLOAD_MAX_EDGE = 3200;

const HEIC_EXTENSIONS = /\.(heic|heif)$/iu;

export function isHeicLikeFile(fileName: string, mimeType = ""): boolean {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (normalizedMime === "image/heic" || normalizedMime === "image/heif") {
    return true;
  }
  return HEIC_EXTENSIONS.test(fileName.trim());
}

export function isLikelyTripPhotoFile(fileName: string, mimeType = ""): boolean {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (normalizedMime.startsWith("image/")) {
    return true;
  }
  if (normalizedMime === "application/octet-stream" || !normalizedMime) {
    return /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tif?f)$/iu.test(fileName.trim());
  }
  return false;
}

export function inferTripPhotoMime(
  fileName: string,
  declaredType: string,
  bytes: Uint8Array,
): string {
  const normalized = declaredType.trim().toLowerCase();
  if (normalized.startsWith("image/") && normalized !== "image/*") {
    return normalized;
  }

  const lowerName = fileName.trim().toLowerCase();
  if (lowerName.endsWith(".heic")) return "image/heic";
  if (lowerName.endsWith(".heif")) return "image/heif";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".avif")) return "image/avif";

  if (bytes.length >= 12) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return "image/png";
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
    const ftyp = String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);
    if (ftyp === "ftyp") {
      const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
      if (/heic|heix|hevc|hevx|mif1|msf1/iu.test(brand)) return "image/heic";
    }
  }

  return normalized || "application/octet-stream";
}
