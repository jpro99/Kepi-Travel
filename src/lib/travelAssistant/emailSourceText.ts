/** Shared helpers for forwarded email + PDF attachment source text. */

export const PDF_ATTACHMENT_MARKER = "--- PDF attachment ---";

export function extractPdfAttachmentSection(text: string): string {
  const marker = PDF_ATTACHMENT_MARKER;
  const idx = text.indexOf(marker);
  if (idx < 0) return "";
  return text.slice(idx).trim();
}

/** Append extracted PDF plain text to an email body for parsing and pricing. */
export function appendPdfAttachmentText(bodyText: string, pdfText: string): string {
  const trimmedPdf = pdfText.trim();
  if (!trimmedPdf) return bodyText.trim();

  const body = bodyText.trim();
  if (body.includes(PDF_ATTACHMENT_MARKER)) return body;
  if (!body) return `${PDF_ATTACHMENT_MARKER}\n\n${trimmedPdf}`;

  return `${body}\n\n${PDF_ATTACHMENT_MARKER}\n\n${trimmedPdf}`;
}

/** Ensure stored source text includes PDF content when we extracted it separately. */
export function ensurePdfInSourceText(sourceText: string, pdfText: string): string {
  const trimmedPdf = pdfText.trim();
  if (!trimmedPdf) return sourceText.trim();

  const existing = sourceText.trim();
  if (existing.includes(PDF_ATTACHMENT_MARKER)) {
    const section = extractPdfAttachmentSection(existing);
    if (section.length >= trimmedPdf.length + PDF_ATTACHMENT_MARKER.length) return existing;
    const withoutPdf = existing.slice(0, existing.indexOf(PDF_ATTACHMENT_MARKER)).trim();
    return appendPdfAttachmentText(withoutPdf, trimmedPdf);
  }

  return appendPdfAttachmentText(existing, trimmedPdf);
}

/** Prefer a fetched/stored source when it adds PDF pricing text the reservation never had. */
export function shouldReplaceStoredSourceText(existing: string, fetched: string): boolean {
  const current = existing.trim();
  const next = fetched.trim();
  if (!next) return false;
  if (!current) return true;
  if (next.includes(PDF_ATTACHMENT_MARKER) && !current.includes(PDF_ATTACHMENT_MARKER)) return true;
  return next.length > current.length;
}

/** Keep PDF attachment section when trimming long forwarded email bodies. */
export function truncateEmailSourceText(text: string, maxChars = 12_000): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const pdfSection = extractPdfAttachmentSection(trimmed);
  if (!pdfSection) return trimmed.slice(0, maxChars);

  const markerIndex = trimmed.indexOf(PDF_ATTACHMENT_MARKER);
  const body = markerIndex >= 0 ? trimmed.slice(0, markerIndex).trim() : trimmed;
  const budgetForBody = maxChars - pdfSection.length - 2;
  if (budgetForBody <= 80) {
    return pdfSection.slice(0, maxChars);
  }
  return `${body.slice(0, budgetForBody)}\n\n${pdfSection}`.slice(0, maxChars);
}

/** When HTML body wins over plain text, keep any PDF section that was appended to plain text. */
export function mergePdfSectionIntoBody(chosenBody: string, rawTextWithPdf: string): string {
  const pdfSection = extractPdfAttachmentSection(rawTextWithPdf);
  if (!pdfSection) return chosenBody;
  const body = chosenBody.trim();
  if (body.includes(PDF_ATTACHMENT_MARKER)) return body;
  if (!body) return pdfSection;
  return `${body}\n\n${pdfSection}`;
}
