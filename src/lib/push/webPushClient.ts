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

/** Register SW, fetch VAPID key from server, and save push subscription. */
export async function subscribeToWebPushNotifications(): Promise<WebPushSubscribeResult> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, message: "Push notifications are not supported on this browser." };
  }

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notification permission denied. Enable in device settings." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const keyResponse = await fetch("/api/push/subscribe", { method: "GET", credentials: "same-origin" });
  if (keyResponse.status === 402) {
    return {
      ok: false,
      message: "Flight alerts require Pro — upgrade to enable push notifications.",
      requiresPro: true,
    };
  }
  if (keyResponse.status === 401) {
    return { ok: false, message: "Sign in to enable flight alerts." };
  }
  if (!keyResponse.ok) {
    return { ok: false, message: "Push is not configured on the server yet. Try again later." };
  }

  const keyPayload = (await keyResponse.json()) as { publicKey?: string };
  if (!keyPayload.publicKey?.trim()) {
    return { ok: false, message: "Push configuration missing — contact support." };
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey) as unknown as BufferSource,
    }));

  const subscribeResponse = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(subscription.toJSON()),
  });

  if (subscribeResponse.status === 402) {
    return {
      ok: false,
      message: "Flight alerts require Pro — upgrade to enable push notifications.",
      requiresPro: true,
    };
  }
  if (!subscribeResponse.ok) {
    return { ok: false, message: "Failed to register push subscription." };
  }

  return { ok: true };
}
