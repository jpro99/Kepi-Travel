export async function storeTripPhotoBytes(args: {
  ownerUserId: string;
  tripId: string;
  photoId: string;
  bytes: Buffer;
  contentType: string;
  variant?: "display" | "print";
}): Promise<string> {
  const variantSuffix = args.variant ? `-${args.variant}` : "";
  const path = `trip-memories/${args.ownerUserId}/${args.tripId}/${args.photoId}${variantSuffix}`;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const blobStoreConfigured = Boolean(blobToken || process.env.BLOB_STORE_ID?.trim());
  const onVercel = process.env.VERCEL === "1";

  if (blobStoreConfigured || onVercel) {
    try {
      const { put } = await import("@vercel/blob");
      const uploaded = await put(path, args.bytes, {
        access: "public",
        contentType: args.contentType,
        ...(blobToken ? { token: blobToken } : {}),
      });
      return uploaded.url;
    } catch (error) {
      if (onVercel) {
        throw error instanceof Error ? error : new Error("Blob upload failed.");
      }
      // Local dev without pulled env — fall through to inline storage.
    }
  }

  if (args.bytes.length > 450_000) {
    throw new Error(
      "Photo is too large for inline storage. Connect Vercel Blob or run vercel env pull for BLOB_READ_WRITE_TOKEN.",
    );
  }

  return `data:${args.contentType};base64,${args.bytes.toString("base64")}`;
}

export async function storeTripPhotoVariants(args: {
  ownerUserId: string;
  tripId: string;
  photoId: string;
  displayBytes: Buffer;
  printBytes: Buffer;
  contentType?: string;
}): Promise<{ imageUrl: string; printImageUrl: string }> {
  const contentType = args.contentType ?? "image/jpeg";
  const [imageUrl, printImageUrl] = await Promise.all([
    storeTripPhotoBytes({
      ownerUserId: args.ownerUserId,
      tripId: args.tripId,
      photoId: args.photoId,
      bytes: args.displayBytes,
      contentType,
      variant: "display",
    }),
    storeTripPhotoBytes({
      ownerUserId: args.ownerUserId,
      tripId: args.tripId,
      photoId: args.photoId,
      bytes: args.printBytes,
      contentType,
      variant: "print",
    }),
  ]);
  return { imageUrl, printImageUrl };
}
