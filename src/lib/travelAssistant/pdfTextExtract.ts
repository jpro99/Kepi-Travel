/** Extract plain text from a PDF buffer for regex confirmation parsing. */
export async function extractPdfPlainText(bytes: Buffer): Promise<string> {
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return "";
  }
  try {
    const pdfParse = (await import("pdf-parse")).default as (
      data: Buffer,
    ) => Promise<{ text?: string }>;
    const parsed = await pdfParse(bytes);
    return typeof parsed.text === "string" ? parsed.text.trim() : "";
  } catch {
    return "";
  }
}

/** PDF text often lacks line breaks between flight rows — restore structure for regex. */
export function preparePdfTextForParsing(rawText: string): string {
  let text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/\s+(?=Flight\s+\d+\s+of\s+\d+)/giu, "\n");
  text = text.replace(/\s+(?=(?:Flight\s*)?[A-Z]{2}\s*\d{1,4}\b)/gu, "\n");
  text = text.replace(/\s+(?=Departure:)/giu, "\n");
  text = text.replace(/\s+(?=Arrival:)/giu, "\n");
  text = text.replace(/\n{3,}/gu, "\n\n");
  return text.trim();
}
