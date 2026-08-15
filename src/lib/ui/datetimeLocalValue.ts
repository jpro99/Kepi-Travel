/** Convert stored "YYYY-MM-DD HH:MM" (or ISO) to an <input type="datetime-local"> value. */
export function toDatetimeLocalValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(" ", "T").slice(0, 16);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) ? normalized : "";
}

/** Store datetime-local as "YYYY-MM-DD HH:MM" for existing reservation parsers. */
export function fromDatetimeLocalValue(value: string): string {
  if (!value.trim()) return "";
  return value.replace("T", " ").slice(0, 16);
}
