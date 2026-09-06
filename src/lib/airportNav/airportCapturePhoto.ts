/**
 * Client-side photo compression for airport captures — keeps queue durable offline.
 */

import { MAX_CAPTURE_PHOTO_CHARS } from "@/lib/airportNav/airportCapture";

export async function compressCapturePhotoFile(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.size > 12 * 1024 * 1024) return null;

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_CAPTURE_PHOTO_CHARS && quality > 0.35) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > MAX_CAPTURE_PHOTO_CHARS) return null;
  return dataUrl;
}
