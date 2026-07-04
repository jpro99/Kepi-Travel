/** True when running as an installed PWA / home-screen app (not mobile Safari/Chrome tab). */
export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
}

/** Android phone/tablet browser — eligible for Chrome install / Add to Home screen prompts. */
export function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}
