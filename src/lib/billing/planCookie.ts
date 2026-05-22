export const KEPI_PLAN_COOKIE_NAME = "kepi-plan";
export const KEPI_PLAN_LIFETIME_VALUE = "lifetime";
export const KEPI_PLAN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readCookieValue(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [rawName, ...rawValueParts] = trimmed.split("=");
    if (rawName !== name) continue;
    const rawValue = rawValueParts.join("=");
    return decodeURIComponent(rawValue);
  }
  return null;
}

export function isLifetimePlanCookieValue(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === KEPI_PLAN_LIFETIME_VALUE;
}
