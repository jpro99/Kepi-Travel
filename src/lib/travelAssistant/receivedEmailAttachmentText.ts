import "server-only";

import type { Resend } from "resend";
import { extractConfirmationPlainText } from "@/lib/travelAssistant/confirmationDocumentText";
import {
  extractDocxPlainText,
  isDocxFilenameOrType,
  isLegacyDocFilename,
} from "@/lib/travelAssistant/docxTextExtract";
import { logger } from "@/lib/logger";

type ReceivedAttachmentMeta = {
  filename?: string | null;
  content_type?: string | null;
  download_url?: string | null;
};

function isPdfAttachment(attachment: ReceivedAttachmentMeta): boolean {
  const filename = attachment.filename?.toLowerCase() ?? "";
  const contentType = attachment.content_type?.toLowerCase() ?? "";
  return filename.endsWith(".pdf") || contentType.includes("pdf");
}

function listReceivedAttachments(payload: unknown): ReceivedAttachmentMeta[] {
  if (Array.isArray(payload)) {
    return payload as ReceivedAttachmentMeta[];
  }
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: ReceivedAttachmentMeta[] }).data;
  }
  return [];
}

export interface ReceivedAttachmentTextResult {
  pdfText: string;
  docxText: string;
  legacyDocFilenames: string[];
}

/** Download PDF + DOCX attachments from a Resend received email. */
export async function extractAttachmentTextFromReceivedEmail(
  resendClient: Resend,
  emailId: string,
  logContext?: Record<string, unknown>,
): Promise<ReceivedAttachmentTextResult> {
  const trimmedEmailId = emailId.trim();
  const empty: ReceivedAttachmentTextResult = { pdfText: "", docxText: "", legacyDocFilenames: [] };
  if (!trimmedEmailId) return empty;

  try {
    const listResponse = await resendClient.emails.receiving.attachments.list({
      emailId: trimmedEmailId,
    });
    if (listResponse.error) {
      logger.warn("Resend attachment list failed for received email.", {
        ...logContext,
        emailId: trimmedEmailId,
        error: listResponse.error.message ?? "unknown",
      });
      return empty;
    }

    const attachments = listReceivedAttachments(listResponse.data);
    if (attachments.length === 0) return empty;

    const pdfTexts: string[] = [];
    const docxTexts: string[] = [];
    const legacyDocFilenames: string[] = [];

    for (const attachment of attachments) {
      if (isLegacyDocFilename(attachment.filename)) {
        legacyDocFilenames.push(attachment.filename ?? "document.doc");
        continue;
      }

      const downloadUrl = attachment.download_url?.trim();
      if (!downloadUrl) continue;

      const wantPdf = isPdfAttachment(attachment);
      const wantDocx = isDocxFilenameOrType(attachment.filename, attachment.content_type);
      if (!wantPdf && !wantDocx) continue;

      try {
        const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) {
          logger.warn("Failed to download attachment from received email.", {
            ...logContext,
            emailId: trimmedEmailId,
            filename: attachment.filename ?? null,
            status: response.status,
          });
          continue;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (wantPdf) {
          const plain = await extractConfirmationPlainText(bytes, "pdf");
          if (plain.trim()) pdfTexts.push(plain.trim());
        } else if (wantDocx) {
          const plain = await extractDocxPlainText(bytes);
          if (plain.trim()) docxTexts.push(plain.trim());
        }
      } catch (error) {
        logger.warn("Failed to parse attachment from received email.", {
          ...logContext,
          emailId: trimmedEmailId,
          filename: attachment.filename ?? null,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    return {
      pdfText: pdfTexts.join("\n\n"),
      docxText: docxTexts.join("\n\n"),
      legacyDocFilenames,
    };
  } catch (error) {
    logger.warn("Resend attachment list threw for received email.", {
      ...logContext,
      emailId: trimmedEmailId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return empty;
  }
}
