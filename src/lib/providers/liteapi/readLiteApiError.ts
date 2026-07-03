/** Extract a human-readable message from LiteAPI JSON error bodies. */
export function readLiteApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload == null) return fallback;

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || fallback;
  }

  if (typeof payload !== "object") {
    return fallback;
  }

  const record = payload as Record<string, unknown>;

  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (message) return message;

  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (description) return description;

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  if (record.error && typeof record.error === "object") {
    return readLiteApiErrorMessage(record.error, fallback);
  }

  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object") {
      return readLiteApiErrorMessage(first, fallback);
    }
  }

  return fallback;
}
