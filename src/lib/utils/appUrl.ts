/** Canonical production URL for links in email, share pages, and redirects. */
export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://kepitravel.com"
  ).replace(/\/$/, "");
}

export function getAppHostname(): string {
  try {
    return new URL(getAppUrl()).hostname;
  } catch {
    return "kepitravel.com";
  }
}
