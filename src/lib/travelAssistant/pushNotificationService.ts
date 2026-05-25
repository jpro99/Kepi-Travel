import webpush, { type PushSubscription } from "web-push";
import { logger } from "@/lib/logger";
import { kvStoreDel, kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const PUSH_SUBSCRIPTION_KEY = "push-sub";
type NativePushPlatform = "ios" | "android";

type PushNotificationPayload = {
  title: string;
  body: string;
  url?: string;
};

export interface NativePushSubscription {
  channel: "native";
  token: string;
  platform: NativePushPlatform;
}

type StoredPushSubscription = PushSubscription | NativePushSubscription;

interface WebPushClient {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: PushSubscription, payload?: string): Promise<unknown>;
}

let webPushClient: WebPushClient = webpush;

function isNativeSubscription(value: unknown): value is NativePushSubscription {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<NativePushSubscription>;
  return (
    candidate.channel === "native" &&
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    (candidate.platform === "ios" || candidate.platform === "android")
  );
}

function isWebPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PushSubscription>;
  return (
    typeof candidate.endpoint === "string" &&
    candidate.endpoint.length > 0 &&
    typeof candidate.keys?.auth === "string" &&
    typeof candidate.keys?.p256dh === "string"
  );
}

function resolveVapidConfig(): { publicKey: string; privateKey: string; mailto: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const mailtoRaw = process.env.VAPID_MAILTO?.trim();
  if (!publicKey || !privateKey || !mailtoRaw) {
    return null;
  }
  const mailto = mailtoRaw.startsWith("mailto:") ? mailtoRaw : `mailto:${mailtoRaw}`;
  return { publicKey, privateKey, mailto };
}

function configureWebPush(): boolean {
  const config = resolveVapidConfig();
  if (!config) {
    logger.warn("Web Push unavailable because VAPID keys are not configured.", {
      scope: "travelAssistant/pushNotificationService",
    });
    return false;
  }
  webPushClient.setVapidDetails(config.mailto, config.publicKey, config.privateKey);
  return true;
}

export async function subscribeUser(userId: string, subscription: StoredPushSubscription): Promise<void> {
  await kvStoreSet(PUSH_SUBSCRIPTION_KEY, subscription, { userId });
}

export async function unsubscribeUser(userId: string): Promise<void> {
  await kvStoreDel(PUSH_SUBSCRIPTION_KEY, { userId });
}

export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload,
): Promise<boolean> {
  const storedSubscription = await kvStoreGet<unknown>(PUSH_SUBSCRIPTION_KEY, { userId });
  if (!storedSubscription) {
    logger.warn("Push subscription missing for user; skipping notification.", {
      scope: "travelAssistant/pushNotificationService",
      userId,
    });
    return false;
  }
  if (isNativeSubscription(storedSubscription)) {
    logger.info("Native push token is registered; web push delivery skipped without FCM/APNS bridge.", {
      scope: "travelAssistant/pushNotificationService",
      userId,
      platform: storedSubscription.platform,
    });
    return false;
  }
  if (!isWebPushSubscription(storedSubscription)) {
    logger.warn("Stored push subscription payload is invalid; removing stale record.", {
      scope: "travelAssistant/pushNotificationService",
      userId,
    });
    await unsubscribeUser(userId);
    return false;
  }
  const subscription = storedSubscription;
  if (!configureWebPush()) {
    return false;
  }

  try {
    await webPushClient.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? "/travel-assistant",
      }),
    );
    return true;
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : null;
    logger.warn("Failed to send Web Push notification.", {
      scope: "travelAssistant/pushNotificationService",
      userId,
      error,
      statusCode,
    });
    if (statusCode === 404 || statusCode === 410) {
      await unsubscribeUser(userId);
    }
    return false;
  }
}

export async function sendGateChangeAlert(
  userId: string,
  flightNumber: string,
  newGate: string,
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: `Gate changed for ${flightNumber}`,
    body: `Your gate is now ${newGate}. Open Kepi to review departure timing.`,
    url: "/travel-assistant",
  });
}

export async function sendDelayAlert(
  userId: string,
  flightNumber: string,
  delayMinutes: number,
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: `Delay alert for ${flightNumber}`,
    body: `${flightNumber} is delayed by ${delayMinutes} minutes. Check updated timeline now.`,
    url: "/travel-assistant",
  });
}

export async function sendDepartureSoonAlert(
  userId: string,
  flightNumber: string,
  minutesUntilDeparture: number,
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: `${flightNumber} departs soon`,
    body: `${minutesUntilDeparture} minutes until departure. Final checks recommended now.`,
    url: "/travel-assistant",
  });
}

export async function sendPackingReminderAlert(
  userId: string,
  tripName: string,
  completionPercent: number,
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: `Packing reminder for ${tripName}`,
    body: `Your packing list is ${completionPercent}% complete and departure is approaching. Finish packing essentials now.`,
    url: "/travel-assistant",
  });
}

export function setWebPushClientForTests(client: WebPushClient | null): void {
  webPushClient = client ?? webpush;
}

export async function sendTravelDayMorningAlert(
  userId: string,
  tripName: string,
  flightNumber: string,
  departureTime: string,
  leaveByTime: string,
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: `Travel day — ${tripName}`,
    body: `${flightNumber} departs at ${departureTime}. Leave by ${leaveByTime} to reach the international terminal with time to spare.`,
    url: "/travel-assistant",
  });
}

export async function sendOnlineCheckInAlert(
  userId: string,
  flightNumber: string,
  departureDate: string,
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: `Check in now — ${flightNumber}`,
    body: `Online check-in is open for your ${departureDate} departure. Check in now to secure your seat.`,
    url: "/travel-assistant",
  });
}

export async function sendPreFlightAlert(
  userId: string,
  flightNumber: string,
  hoursUntil: number,
  leaveByTime: string,
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: `${hoursUntil}hrs to ${flightNumber}`,
    body: `Head to the international terminal. Leave by ${leaveByTime} — allow 3 hours for check-in, security, and customs.`,
    url: "/travel-assistant",
  });
}

export async function sendHotelCheckoutAlert(
  userId: string,
  hotelName: string,
  checkoutTime: string,
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: `Check out today — ${hotelName}`,
    body: `Checkout is at ${checkoutTime}. Pack tonight, settle your bill early, and store luggage with the concierge if needed.`,
    url: "/travel-assistant",
  });
}
