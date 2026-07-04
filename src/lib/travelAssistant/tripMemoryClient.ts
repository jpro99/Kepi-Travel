import {
  TRIP_PHOTO_CLIENT_UPLOAD_MAX_EDGE,
  isHeicLikeFile,
  isLikelyTripPhotoFile,
} from "@/lib/travelAssistant/tripMemoryImageTypes";

async function convertHeicToJpeg(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!(blob instanceof Blob)) {
    throw new Error("Could not convert HEIC photo.");
  }
  return blob;
}

async function rasterizeToJpeg(file: File, maxDimension: number, quality: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not prepare photo for upload.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/jpeg", quality);
  });
  if (!blob) {
    throw new Error("Could not prepare photo for upload.");
  }

  const base = file.name.replace(/\.[^.]+$/u, "") || "trip-photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

/**
 * Prepare a phone photo for upload: accept HEIC/HEIF/JPEG/PNG/WebP, convert exotic
 * formats to JPEG, and cap upload size while leaving print-quality work to the server.
 */
export async function prepareTripPhotoForUpload(file: File): Promise<File> {
  if (!isLikelyTripPhotoFile(file.name, file.type)) {
    throw new Error("Choose a photo from your camera roll (JPEG, HEIC, PNG, or WebP).");
  }

  let workingFile = file;

  if (isHeicLikeFile(file.name, file.type)) {
    const jpegBlob = await convertHeicToJpeg(file);
    const base = file.name.replace(/\.[^.]+$/u, "") || "trip-photo";
    workingFile = new File([jpegBlob], `${base}.jpg`, { type: "image/jpeg" });
  } else if (file.type === "image/gif") {
    return file;
  } else {
    try {
      const probe = await createImageBitmap(workingFile);
      probe.close();
    } catch {
      if (isHeicLikeFile(file.name, file.type) || file.name.match(/\.(heic|heif)$/iu)) {
        const jpegBlob = await convertHeicToJpeg(file);
        const base = file.name.replace(/\.[^.]+$/u, "") || "trip-photo";
        workingFile = new File([jpegBlob], `${base}.jpg`, { type: "image/jpeg" });
      } else {
        throw new Error("This photo format is not supported. Try JPEG or HEIC from your gallery.");
      }
    }
  }

  if (workingFile.type === "image/gif") {
    return workingFile;
  }

  try {
    const bitmap = await createImageBitmap(workingFile);
    const needsResize =
      Math.max(bitmap.width, bitmap.height) > TRIP_PHOTO_CLIENT_UPLOAD_MAX_EDGE ||
      workingFile.size > 10 * 1024 * 1024;
    bitmap.close();
    if (needsResize) {
      return rasterizeToJpeg(workingFile, TRIP_PHOTO_CLIENT_UPLOAD_MAX_EDGE, 0.9);
    }
  } catch {
    return workingFile;
  }

  if (!workingFile.type.startsWith("image/") || workingFile.type === "image/jpeg") {
    return workingFile;
  }

  return rasterizeToJpeg(workingFile, TRIP_PHOTO_CLIENT_UPLOAD_MAX_EDGE, 0.9);
}

/** @deprecated Use prepareTripPhotoForUpload. */
export async function compressTripPhotoFile(file: File): Promise<File> {
  return prepareTripPhotoForUpload(file);
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image."));
    img.src = src;
  });
}
