import { NextResponse } from "next/server";
import { resolveConfirmationScanKind } from "@/lib/travelAssistant/confirmationDocumentText";
import { extractConfirmationDocumentWithText } from "@/lib/travelAssistant/extractConfirmationDocument";
import { truncateEmailSourceText } from "@/lib/travelAssistant/emailSourceText";
import {
  CONFIRMATION_SCAN_MAX_BYTES,
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
    return NextResponse.json({ error: "PDF, image, HTML, or text file is required." }, { status: 400, headers });
  }
  if (!isConfirmationScanUpload(upload)) {
    return NextResponse.json(
      { error: "Upload a PDF, image, HTML email, or text confirmation." },
      { status: 422, headers },
    );
  }
  if (upload.size <= 0 || upload.size > CONFIRMATION_SCAN_MAX_BYTES) {
    const maxMb = Math.floor(CONFIRMATION_SCAN_MAX_BYTES / (1024 * 1024));
    return NextResponse.json(
      { error: `File is too large. Upload up to ${maxMb}MB.` },
      { status: 413, headers },
    );
  }

  const fileBytes = Buffer.from(await upload.arrayBuffer());
  const scanKind = resolveConfirmationScanKind(upload, fileBytes);

  try {
    const { drafts, documentText } = await extractConfirmationDocumentWithText(
      upload,
      options.anthropicApiKey,
    );
    return NextResponse.json(
      {
        drafts,
        draft: drafts[0] ?? null,
        count: drafts.length,
        scanKind,
        // G42 — the client prices the whole PNR from this text.
        documentText: truncateEmailSourceText(documentText),
      },
      { headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown confirmation scan error.";
    return NextResponse.json({ error: `Confirmation scan failed: ${message}` }, { status: 502, headers });
  }
}
