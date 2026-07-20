/**
 * Extract plain text from a .docx (Office Open XML) buffer.
 * Old binary .doc is not supported — return empty and let the caller note it.
 */

export function isDocxBuffer(bytes: Buffer): boolean {
  // ZIP local file header — docx is a zip package
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function isDocxFilenameOrType(filename?: string | null, contentType?: string | null): boolean {
  const name = filename?.toLowerCase() ?? "";
  const type = contentType?.toLowerCase() ?? "";
  if (name.endsWith(".docx")) return true;
  if (type.includes("wordprocessingml") || type.includes("officedocument.wordprocessingml")) return true;
  if (type === "application/vnd.ms-word.document.macroenabled.12") return true;
  return false;
}

/** True for legacy .doc that we cannot parse with mammoth. */
export function isLegacyDocFilename(filename?: string | null): boolean {
  const name = filename?.toLowerCase() ?? "";
  return name.endsWith(".doc") && !name.endsWith(".docx");
}

export async function extractDocxPlainText(bytes: Buffer): Promise<string> {
  if (!bytes.length) return "";
  if (!isDocxBuffer(bytes)) return "";
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bytes });
  return (result.value ?? "")
    .replace(/\r\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
