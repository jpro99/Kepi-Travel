export function deepMergeMessages(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const existing = merged[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      merged[key] = deepMergeMessages(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }
    merged[key] = value;
  }
  return merged;
}
