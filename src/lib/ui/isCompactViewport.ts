import { isInstalledAppShell } from "@/lib/ui/isStandaloneApp";

/** Synchronous compact/mobile viewport check — use before opening hotel search UI. */
export function isCompactViewportClient(): boolean {
  if (typeof window === "undefined") return false;

  const forceMobile = new URLSearchParams(window.location.search).get("mobile") === "1";
  if (forceMobile) return true;
  if (isInstalledAppShell()) return true;
  if (window.matchMedia("(max-width: 1023px)").matches) return true;
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches && window.innerWidth < 1280) {
    return true;
  }
  return false;
}
