import { NextResponse } from "next/server";
import { extractConfirmationDocument } from "@/lib/travelAssistant/extractConfirmationDocument";
import {
  CONFIRMATION_SCAN_MAX_BYTES,
  confirmationScanKind,
  isConfirmationScanUpload,
} from "@/lib/travelAssistant/scannedReservationDraft";

export async function handleConfirmationScanUpload(
  req: Request,
  options: { anthropicApiKey: string; rateLimitHeaders?: Record<string, string> },
): Promise<NextResponse> {
  const headers = options.rateLimitHeaders ?? {};

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400, headers });
  }

  const upload = formData.get("file") ?? formData.get("image");
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "PDF or image file is required." }, { status: 400, headers });
  }
  if (!isConfirmationScanUpload(upload)) {
    return NextResponse.json({ error: "Upload a PDF or image (JPG, PNG, WebP)." }, { status: 422, headers });
  }
  if (upload.size <= 0 || upload.size > CONFIRMATION_SCAN_MAX_BYTES) {
    const maxMb = Math.floor(CONFIRMATION_SCAN_MAX_BYTES / (1024 * 1024));
    return NextResponse.json(
      { error: `File is too large. Upload up to ${maxMb}MB.` },
      { status: 413, headers },
    );
  }

  const scanKind = confirmationScanKind(upload);

  try {
    const drafts = await extractConfirmationDocument(upload, options.anthropicApiKey);
    return NextResponse.json(
      { drafts, draft: drafts[0] ?? null, count: drafts.length, scanKind },
      { headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown confirmation scan error.";
    return NextResponse.json({ error: `Confirmation scan failed: ${message}` }, { status: 502, headers });
  }
}
