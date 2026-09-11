export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export type WebPushSubscribeResult =
  | { ok: true }
  | { ok: false; message: string; requiresPro?: boolean; blocked?: boolean };

function readVapidPublicKeyFromMeta(): string | null {
  if (typeof document === "undefined") return null;
  const meta = document.querySelector('meta[name="vapid-public-key"]');
  const content = meta?.getAttribute("content")?.trim();
  return content || null;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/iu.test(navigator.userAgent);
}

function isDesktopSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/iu.test(ua) && !/Chrome|Chromium|Android/iu.test(ua) && !isIosSafari();
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/iu.test(navigator.userAgent);
}

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Read the browser notification permission without prompting. */
export function readNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  const permission = Notification.permission;
  if (permission === "granted" || permission === "denied" || permission === "default") {
    return permission;
  }
  return "unsupported";
}

/** Current site hostname for honest Android Chrome site-settings copy (preview vs production). */
export function readNotificationSiteHostname(): string {
  if (typeof window === "undefined") return "this site";
  return window.location.hostname?.trim() || "this site";
}

/**
 * Android: Kepi in a Chrome tab is NOT listed as "Kepi Travel" under Settings → Notifications.
 * Permission lives under Chrome → Site settings → Notifications for this hostname,
 * unless the PWA is installed (own channel). Never fakes granted.
 */
export function buildAndroidNotificationSettingsGuide(input?: {
  blocked?: boolean;
  includeNeverPromptedNote?: boolean;
}): string {
  const host = readNotificationSiteHostname();
  const blocked = input?.blocked === true;
  const includeNeverPromptedNote = input?.includeNeverPromptedNote !== false;

  if (isStandalonePwa()) {
    const prefix = blocked
      ? "Notifications are blocked for the installed Kepi app."
      : "To enable flight alerts on the installed Kepi app:";
    return (
      `${prefix} Long-press the Kepi icon → App info → Notifications → Allow. ` +
      "If still blocked, also check Chrome → ⋮ → Settings → Site settings → Notifications → " +
      `${host} → Allow, then return here and tap Enable again.`
    );
  }

  const blockedPrefix = blocked
    ? "Notifications are blocked for this site in Chrome."
    : "To enable flight alerts in Chrome:";
  const neverPrompted =
    includeNeverPromptedNote && !blocked
      ? "Tap Enable here first — Chrome must show the permission prompt before this site appears under Notifications. "
      : "";
  const notListed =
    "Kepi does not appear as its own app (\"Kepi Travel\") in Android Settings → Notifications while you use it in a Chrome tab — only Chrome controls this site. ";

  return (
    `${neverPrompted}${blockedPrefix} ${notListed}` +
    `Open Chrome → ⋮ → Settings → Site settings → Notifications → find ${host} → Allow. ` +
    "Or install Kepi to your Home Screen (Add to Home screen) so it can get its own notification channel. " +
    "Then return here and tap Enable again."
  );
}

/** Honest copy when the user previously blocked notifications — Chrome cannot re-prompt. */
export function buildBlockedNotificationHelp(): string {
  const host = readNotificationSiteHostname();
  if (isIosSafari()) {
    return (
      "Notifications are blocked for Kepi. On iPhone: Settings → Notifications → Kepi → Allow Notifications, " +
      "then reopen Kepi from your Home Screen."
    );
  }
  if (isAndroid()) {
    return buildAndroidNotificationSettingsGuide({ blocked: true, includeNeverPromptedNote: false });
  }
  if (isDesktopSafari()) {
    return (
      `Notifications are blocked for ${host}. In Safari: click the website settings button (lock or AA icon) in the address bar → ` +
      "Settings for This Website → Notifications → Allow. Then return here and tap Enable again."
    );
  }
  return (
    `Notifications are blocked for ${host}. Click the lock or site-info icon in the address bar → Site settings → ` +
    "Notifications → Allow. Then return here and tap Enable again."
  );
}

function buildPermissionNotGrantedHelp(): string {
  if (isAndroid()) {
    return buildAndroidNotificationSettingsGuide({ blocked: false });
  }
  return "Notification permission was not granted. Tap Enable again when you are ready.";
}

async function fetchVapidPublicKey(): Promise<
  | { ok: true; publicKey: string }
  | { ok: false; status: number; requiresPro?: boolean }
> {
  const response = await fetch("/api/push/subscribe", { method: "GET", credentials: "include" });
  if (response.status === 402) {
    return { ok: false, status: 402, requiresPro: true };
  }
  if (response.status === 401) {
    return { ok: false, status: 401 };
  }
  if (!response.ok) {
    const metaKey = readVapidPublicKeyFromMeta();
    if (metaKey) {
      return { ok: true, publicKey: metaKey };
    }
    return { ok: false, status: response.status };
  }

  const payload = (await response.json()) as { publicKey?: string };
  const publicKey = payload.publicKey?.trim() || readVapidPublicKeyFromMeta();
  if (!publicKey) {
    return { ok: false, status: 503 };
  }
  return { ok: true, publicKey };
}

async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const current = readNotificationPermissionState();
  if (current === "granted" || current === "denied" || current === "unsupported") {
    return current;
  }
  try {
    const result = await Notification.requestPermission();
    if (result === "granted" || result === "denied" || result === "default") {
      return result;
    }
    return readNotificationPermissionState();
  } catch {
    return readNotificationPermissionState();
  }
}

/** Register SW, fetch VAPID key from server, and save push subscription. Never fakes granted. */
export async function subscribeToWebPushNotifications(): Promise<WebPushSubscribeResult> {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return { ok: false, message: "Flight alerts require a secure connection (https)." };
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    if (isIosSafari() && !isStandalonePwa()) {
      return {
        ok: false,
        message:
          "On iPhone, tap Share → Add to Home Screen, open Kepi from your home screen, then enable flight alerts.",
      };
    }
    return { ok: false, message: "Push notifications are not supported in this browser." };
  }

  if (isIosSafari() && !isStandalonePwa()) {
    return {
      ok: false,
      message:
        "On iPhone, tap Share → Add to Home Screen, open Kepi from your home screen, then enable flight alerts.",
    };
  }

  const existingPermission = readNotificationPermissionState();
  if (existingPermission === "denied") {
    return {
      ok: false,
      blocked: true,
      message: buildBlockedNotificationHelp(),
    };
  }

  const permission =
    existingPermission === "granted" ? "granted" : await requestNotificationPermission();
  if (permission !== "granted") {
    if (permission === "denied") {
      return {
        ok: false,
        blocked: true,
        message: buildBlockedNotificationHelp(),
      };
    }
    return {
      ok: false,
      message: buildPermissionNotGrantedHelp(),
    };
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not register the service worker.";
    return { ok: false, message: `Could not enable push: ${message}` };
  }

  const keyResult = await fetchVapidPublicKey();
  if (!keyResult.ok) {
    if (keyResult.requiresPro) {
      return {
        ok: false,
        message: "Flight alerts require Pro — upgrade to enable push notifications.",
        requiresPro: true,
      };
    }
    if (keyResult.status === 401) {
      return { ok: false, message: "Sign in to enable flight alerts." };
    }
    return { ok: false, message: "Push is not configured on the server yet. Try again later." };
  }

  let existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    try {
      await existingSubscription.unsubscribe();
    } catch {
      /* best-effort reset stale subscription */
    }
    existingSubscription = null;
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey) as unknown as BufferSource,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not subscribe to push.";
    if (/not supported|denied|permission|blocked/iu.test(message)) {
      if (readNotificationPermissionState() === "denied") {
        return { ok: false, blocked: true, message: buildBlockedNotificationHelp() };
      }
      if (isAndroid()) {
        return { ok: false, blocked: true, message: buildBlockedNotificationHelp() };
      }
      return { ok: false, message: "This browser blocked push alerts. Check notification settings." };
    }
    return { ok: false, message: `Could not enable push: ${message}` };
  }

  const subscribeResponse = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(subscription.toJSON()),
  });

  if (subscribeResponse.status === 402) {
    try {
      await subscription.unsubscribe();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      message: "Flight alerts require Pro — upgrade to enable push notifications.",
      requiresPro: true,
    };
  }
  if (!subscribeResponse.ok) {
    try {
      await subscription.unsubscribe();
    } catch {
      /* ignore */
    }
    const payload = (await subscribeResponse.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: payload.error ?? "Failed to register push subscription." };
  }

  if (readNotificationPermissionState() !== "granted") {
    try {
      await subscription.unsubscribe();
    } catch {
      /* ignore */
    }
    return { ok: false, blocked: true, message: buildBlockedNotificationHelp() };
  }

  return { ok: true };
}

/** Best-effort check whether this device already has an active web push subscription. */
export async function readWebPushSubscriptionActive(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return false;
  }
  if (readNotificationPermissionState() !== "granted") {
    return false;
  }
  try {
    const registration =
      (await navigator.serviceWorker.getRegistration("/sw.js")) ??
      (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}
