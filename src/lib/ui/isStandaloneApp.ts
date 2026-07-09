/** True when running as an installed PWA / home-screen app (not mobile Safari/Chrome tab). */
export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
}

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

/** True in PWA standalone OR the Capacitor App Store / Play Store shell. */
export function isInstalledAppShell(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandaloneApp()) return true;
  const capacitor = (window as CapacitorWindow).Capacitor;
  if (capacitor?.isNativePlatform?.()) return true;
  return /Capacitor/i.test(navigator.userAgent);
}

/** Android phone/tablet browser — eligible for Chrome install / Add to Home screen prompts. */
export function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

/** True in PWA standalone OR the Capacitor App Store / Play Store shell. */
export function isInstalledAppShell(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandaloneApp()) return true;
  const capacitor = (window as CapacitorWindow).Capacitor;
  if (capacitor?.isNativePlatform?.()) return true;
  return /Capacitor/i.test(navigator.userAgent);
}

/** iPhone, iPad, or iPod — Safari and home-screen web apps need extra map/GPS handling. */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent);
}
