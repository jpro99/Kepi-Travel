/** Shared helpers for forwarded email + PDF/DOCX attachment source text. */

export const PDF_ATTACHMENT_MARKER = "--- PDF attachment ---";
export const DOCX_ATTACHMENT_MARKER = "--- Word attachment ---";

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

/** Append extracted Word (.docx) plain text for day-plan itinerary parsing. */
export function appendDocxAttachmentText(bodyText: string, docxText: string): string {
  const trimmed = docxText.trim();
  if (!trimmed) return bodyText.trim();

  const body = bodyText.trim();
  if (body.includes(DOCX_ATTACHMENT_MARKER)) return body;
  if (!body) return `${DOCX_ATTACHMENT_MARKER}\n\n${trimmed}`;

  return `${body}\n\n${DOCX_ATTACHMENT_MARKER}\n\n${trimmed}`;
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

/** True when email/PDF text contains a parseable ticket total or award summary. */
export function sourceTextHasPricingSignal(text: string): boolean {
  const haystack = text.trim();
  if (!haystack) return false;
  if (haystack.includes(PDF_ATTACHMENT_MARKER) && /\b(?:total\s+amount|totale|new\s+ticket\s+value|EUR|USD)\b/iu.test(haystack)) {
    return true;
  }
  return (
    /\bnew\s+ticket\s+value\b/iu.test(haystack) ||
    /\boriginal\s+ticket\s+value\b/iu.test(haystack) ||
    /\bticket\s+value\b[^$\d]{0,80}\$?\s*[\d,]+/iu.test(haystack) ||
    /\bpurchase\s+summary\b/iu.test(haystack) ||
    /\btotal\s+amount\b[^€\d]{0,40}(?:€|EUR)/iu.test(haystack) ||
    /\b(?:grand\s+total|ticket\s+total|airfare\s+total)\b[^$\d]{0,40}\$?\s*[\d,]+/iu.test(haystack)
  );
}

/** Prefer a fetched/stored source when it adds PDF pricing text the reservation never had. */
export function shouldReplaceStoredSourceText(existing: string, fetched: string): boolean {
  const current = existing.trim();
  const next = fetched.trim();
  if (!next) return false;
  if (!current) return true;
  const currentHasPrice = sourceTextHasPricingSignal(current);
  const nextHasPrice = sourceTextHasPricingSignal(next);
  // Later itinerary forwards are longer but drop the fare — never overwrite a priced receipt.
  if (currentHasPrice && !nextHasPrice) return false;
  if (nextHasPrice && !currentHasPrice) return true;
  if (next.includes(PDF_ATTACHMENT_MARKER) && !current.includes(PDF_ATTACHMENT_MARKER)) return true;
  return next.length > current.length;
}

function extractPricingTail(text: string): string {
  const needles = [
    /\bNew\s+Ticket\s+Value\b/iu,
    /\bTicket\s+Value\b/iu,
    /\bPurchase\s+Summary\b/iu,
    /\bTotal\s+Amount\b/iu,
    /\bSummary\s+of\s+airfare\b/iu,
  ];
  let earliest = -1;
  for (const needle of needles) {
    const match = text.match(needle);
    if (match?.index != null && (earliest < 0 || match.index < earliest)) {
      earliest = match.index;
    }
  }
  if (earliest < 0) return "";
  return text.slice(earliest).trim();
}

/** Keep PDF attachment section and Purchase Summary when trimming long forwarded email bodies. */
export function truncateEmailSourceText(text: string, maxChars = 12_000): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const pdfSection = extractPdfAttachmentSection(trimmed);
  const pricingTail = extractPricingTail(trimmed);

  if (!pdfSection && !pricingTail) return trimmed.slice(0, maxChars);

  const markerIndex = trimmed.indexOf(PDF_ATTACHMENT_MARKER);
  const body = markerIndex >= 0 ? trimmed.slice(0, markerIndex).trim() : trimmed;
  const reservedTail = [pricingTail, pdfSection].filter(Boolean).join("\n\n");
  const budgetForBody = maxChars - reservedTail.length - (reservedTail ? 2 : 0);
  if (budgetForBody <= 80) {
    return reservedTail.slice(0, maxChars);
  }
  const head = body.slice(0, budgetForBody).trim();
  return reservedTail ? `${head}\n\n${reservedTail}`.slice(0, maxChars) : head.slice(0, maxChars);
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
