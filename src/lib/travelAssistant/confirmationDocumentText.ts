import { extractPdfPlainText, preparePdfTextForParsing } from "@/lib/travelAssistant/pdfTextExtract";

export type ConfirmationScanKind = "pdf" | "html" | "text" | "image";

const HTML_EXTENSIONS = new Set([".html", ".htm", ".mhtml", ".eml"]);
const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".ics"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"]);

export function isPdfBuffer(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

/** True when bytes look like HTML even if saved with a .pdf extension. */
export function isHtmlBuffer(bytes: Buffer): boolean {
  if (bytes.length === 0) return false;
  const head = bytes.subarray(0, Math.min(bytes.length, 12_000)).toString("utf8").trimStart().toLowerCase();
  if (!head.includes("<")) return false;
  if (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    head.startsWith("<body")
  ) {
    return true;
  }
  if (/<html[\s>]/iu.test(head) || /<body[\s>]/iu.test(head)) return true;
  if (/<meta[\s>]/iu.test(head) && /<\/(table|div|p|tr|td|span|li)>/iu.test(head)) return true;
  if (/<table[\s>]/iu.test(head) && /<\/(td|tr|div|p|span)>/iu.test(head)) return true;
  return false;
}

export function htmlToPlainConfirmationText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/giu, "\n")
    .replace(/<script[\s\S]*?<\/script>/giu, "\n")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p>/giu, "\n")
    .replace(/<\/div>/giu, "\n")
    .replace(/<\/tr>/giu, "\n")
    .replace(/<\/li>/giu, "\n")
    .replace(/<\/h[1-6]>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#39;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isImageFile(file: File): boolean {
  const ext = fileExtension(file.name);
  return file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
}

function isHtmlFile(file: File): boolean {
  const ext = fileExtension(file.name);
  const type = file.type.toLowerCase();
  return type.includes("html") || type === "message/rfc822" || HTML_EXTENSIONS.has(ext);
}

function isTextFile(file: File): boolean {
  const ext = fileExtension(file.name);
  const type = file.type.toLowerCase();
  return type.startsWith("text/") || TEXT_EXTENSIONS.has(ext);
}

/** Resolve document kind from bytes first — catches HTML saved as .pdf. */
export function resolveConfirmationScanKind(file: File, bytes: Buffer): ConfirmationScanKind {
  if (isPdfBuffer(bytes)) return "pdf";
  if (isHtmlBuffer(bytes)) return "html";
  if (isImageFile(file)) return "image";
  if (isHtmlFile(file)) return "html";
  if (isTextFile(file)) return "text";
  const ext = fileExtension(file.name);
  const type = file.type.toLowerCase();
  if (type === "application/pdf" || ext === ".pdf") {
    return "text";
  }
  if (isImageFile(file)) return "image";
  return "text";
}

export async function extractConfirmationPlainText(
  bytes: Buffer,
  kind: ConfirmationScanKind,
): Promise<string> {
  if (kind === "pdf") {
    return preparePdfTextForParsing(await extractPdfPlainText(bytes));
  }

  const raw = bytes.toString("utf8");
  if (kind === "html" || isHtmlBuffer(bytes)) {
    return preparePdfTextForParsing(htmlToPlainConfirmationText(raw));
  }

  const stripped = raw.includes("<") && raw.includes(">") ? htmlToPlainConfirmationText(raw) : raw;
  return preparePdfTextForParsing(stripped);
}

export function confirmationKindUsesTextExtraction(kind: ConfirmationScanKind): boolean {
  return kind === "pdf" || kind === "html" || kind === "text";
}
