import webpush, { type PushSubscription } from "web-push";
import { logger } from "@/lib/logger";
import { kvStoreDel, kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const PUSH_SUBSCRIPTION_KEY = "push-sub";

type PushNotificationPayload = {
  title: string;
  body: string;
  url?: string;
};

interface WebPushClient {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: PushSubscription, payload?: string): Promise<unknown>;
}

let webPushClient: WebPushClient = webpush;

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

export async function subscribeUser(userId: string, subscription: PushSubscription): Promise<void> {
  await kvStoreSet(PUSH_SUBSCRIPTION_KEY, subscription, { userId });
}

export async function unsubscribeUser(userId: string): Promise<void> {
  await kvStoreDel(PUSH_SUBSCRIPTION_KEY, { userId });
}

export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload,
): Promise<boolean> {
  const subscription = await kvStoreGet<PushSubscription>(PUSH_SUBSCRIPTION_KEY, { userId });
  if (!subscription) {
    logger.warn("Push subscription missing for user; skipping notification.", {
      scope: "travelAssistant/pushNotificationService",
      userId,
    });
    return false;
  }
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

export function setWebPushClientForTests(client: WebPushClient | null): void {
  webPushClient = client ?? webpush;
}
