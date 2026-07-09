import "server-only";

import type { Resend } from "resend";
import { extractConfirmationPlainText } from "@/lib/travelAssistant/confirmationDocumentText";
import { appendPdfAttachmentText } from "@/lib/travelAssistant/emailSourceText";
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

function listReceivedAttachments(
  payload: unknown,
): ReceivedAttachmentMeta[] {
  if (Array.isArray(payload)) {
    return payload as ReceivedAttachmentMeta[];
  }
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: ReceivedAttachmentMeta[] }).data;
  }
  return [];
}

/** Download PDF attachments from a Resend received email and return extracted plain text. */
export async function extractPdfTextFromReceivedEmail(
  resendClient: Resend,
  emailId: string,
  logContext?: Record<string, unknown>,
): Promise<string> {
  const trimmedEmailId = emailId.trim();
  if (!trimmedEmailId) return "";

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
      return "";
    }

    const attachments = listReceivedAttachments(listResponse.data);
    if (attachments.length === 0) return "";

    const pdfTexts: string[] = [];
    for (const attachment of attachments) {
      if (!isPdfAttachment(attachment)) continue;
      const downloadUrl = attachment.download_url?.trim();
      if (!downloadUrl) continue;

      try {
        const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) {
          logger.warn("Failed to download PDF attachment from received email.", {
            ...logContext,
            emailId: trimmedEmailId,
            filename: attachment.filename ?? null,
            status: response.status,
          });
          continue;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        const plain = await extractConfirmationPlainText(bytes, "pdf");
        if (plain.trim()) {
          pdfTexts.push(plain.trim());
        }
      } catch (error) {
        logger.warn("Failed to parse PDF attachment from received email.", {
          ...logContext,
          emailId: trimmedEmailId,
          filename: attachment.filename ?? null,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    return pdfTexts.join("\n\n");
  } catch (error) {
    logger.warn("Resend attachment list threw for received email.", {
      ...logContext,
      emailId: trimmedEmailId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return "";
  }
}

export interface ReceivedEmailSourceText {
  subject: string;
  text: string;
  html: string;
}

/** Fetch received email body + PDF attachment text from Resend (for re-scan / backfill). */
export async function fetchReceivedEmailSourceText(
  resendClient: Resend,
  emailId: string,
  logContext?: Record<string, unknown>,
): Promise<ReceivedEmailSourceText | null> {
  const trimmedEmailId = emailId.trim();
  if (!trimmedEmailId) return null;

  try {
    const receivedEmailResponse = await resendClient.emails.receiving.get(trimmedEmailId);
    if (receivedEmailResponse.error || !receivedEmailResponse.data) {
      logger.warn("Resend receiving lookup failed during source backfill.", {
        ...logContext,
        emailId: trimmedEmailId,
        error: receivedEmailResponse.error?.message ?? "unknown",
      });
      return null;
    }

    const receivedEmail = receivedEmailResponse.data;
    const pdfText = await extractPdfTextFromReceivedEmail(resendClient, trimmedEmailId, logContext);
    const bodyText = receivedEmail.text?.trim() ?? "";
    const html = receivedEmail.html?.trim() ?? "";
    const combinedText = appendPdfAttachmentText(bodyText, pdfText);

    return {
      subject: receivedEmail.subject?.trim() ?? "",
      text: combinedText,
      html,
    };
  } catch (error) {
    logger.warn("Resend receiving lookup threw during source backfill.", {
      ...logContext,
      emailId: trimmedEmailId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
