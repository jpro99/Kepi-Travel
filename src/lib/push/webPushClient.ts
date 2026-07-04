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

export type WebPushSubscribeResult =
  | { ok: true }
  | { ok: false; message: string; requiresPro?: boolean };

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

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
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

/** Register SW, fetch VAPID key from server, and save push subscription. */
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

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notification permission denied. Enable alerts in your device settings." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

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
    if (/not supported|denied|permission/iu.test(message)) {
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
  if (Notification.permission !== "granted") {
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
