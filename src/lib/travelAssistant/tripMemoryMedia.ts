export async function storeTripPhotoBytes(args: {
  ownerUserId: string;
  tripId: string;
  photoId: string;
  bytes: Buffer;
  contentType: string;
}): Promise<string> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const path = `trip-memories/${args.ownerUserId}/${args.tripId}/${args.photoId}`;

  if (blobToken) {
    const { put } = await import("@vercel/blob");
    const uploaded = await put(path, args.bytes, {
      access: "public",
      contentType: args.contentType,
      token: blobToken,
    });
    return uploaded.url;
  }

  if (args.bytes.length > 450_000) {
    throw new Error(
      "Photo is too large for inline storage. Add BLOB_READ_WRITE_TOKEN on Vercel for full-resolution uploads.",
    );
  }

  return `data:${args.contentType};base64,${args.bytes.toString("base64")}`;
}
