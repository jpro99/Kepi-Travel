import "server-only";

import type { Resend } from "resend";
import { extractAttachmentTextFromReceivedEmail } from "@/lib/travelAssistant/receivedEmailAttachmentText";
import { htmlToPlainConfirmationText } from "@/lib/travelAssistant/confirmationDocumentText";
import {
  appendDocxAttachmentText,
  appendPdfAttachmentText,
} from "@/lib/travelAssistant/emailSourceText";
import { logger } from "@/lib/logger";

/** Download PDF attachments from a Resend received email and return extracted plain text. */
export async function extractPdfTextFromReceivedEmail(
  resendClient: Resend,
  emailId: string,
  logContext?: Record<string, unknown>,
): Promise<string> {
  const result = await extractAttachmentTextFromReceivedEmail(resendClient, emailId, logContext);
  return result.pdfText;
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
    const attachmentText = await extractAttachmentTextFromReceivedEmail(
      resendClient,
      trimmedEmailId,
      logContext,
    );
    const bodyText = receivedEmail.text?.trim() ?? "";
    const html = receivedEmail.html?.trim() ?? "";
    const htmlText = html ? htmlToPlainConfirmationText(html) : "";
    const richerBody = htmlText.length > bodyText.length * 1.1 ? htmlText : bodyText || htmlText;
    const withPdf = appendPdfAttachmentText(richerBody, attachmentText.pdfText);
    const combinedText = appendDocxAttachmentText(withPdf, attachmentText.docxText);

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
