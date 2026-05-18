import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  sendDelayAlert,
  sendDepartureSoonAlert,
  sendGateChangeAlert,
  setWebPushClientForTests,
  subscribeUser,
  unsubscribeUser,
} from "@/lib/travelAssistant/pushNotificationService";

function createSubscription(suffix: string) {
  return {
    endpoint: `https://push.example.com/${suffix}`,
    keys: {
      p256dh: "test-p256dh",
      auth: "test-auth",
    },
  };
}

test("sendGateChangeAlert dispatches a push notification", async () => {
  const userId = `push-test-${randomUUID()}`;
  const previousPublic = process.env.VAPID_PUBLIC_KEY;
  const previousPrivate = process.env.VAPID_PRIVATE_KEY;
  const previousMailto = process.env.VAPID_MAILTO;
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  process.env.VAPID_MAILTO = "alerts@example.com";

  const notifications: Array<{ endpoint: string; payload: { title: string; body: string; url: string } }> = [];
  setWebPushClientForTests({
    setVapidDetails() {
      // noop
    },
    async sendNotification(subscription, payload) {
      notifications.push({
        endpoint: subscription.endpoint,
        payload: JSON.parse(payload ?? "{}") as { title: string; body: string; url: string },
      });
    },
  });

  try {
    await subscribeUser(userId, createSubscription("gate-change"));
    const result = await sendGateChangeAlert(userId, "DL407", "A12");
    assert.equal(result, true);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.payload.title, "Gate changed for DL407");
    assert.match(notifications[0]?.payload.body ?? "", /A12/);
  } finally {
    await unsubscribeUser(userId);
    setWebPushClientForTests(null);
    process.env.VAPID_PUBLIC_KEY = previousPublic;
    process.env.VAPID_PRIVATE_KEY = previousPrivate;
    process.env.VAPID_MAILTO = previousMailto;
  }
});

test("sendDelayAlert dispatches a push notification", async () => {
  const userId = `push-test-${randomUUID()}`;
  const previousPublic = process.env.VAPID_PUBLIC_KEY;
  const previousPrivate = process.env.VAPID_PRIVATE_KEY;
  const previousMailto = process.env.VAPID_MAILTO;
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  process.env.VAPID_MAILTO = "alerts@example.com";

  const notifications: Array<{ title: string; body: string }> = [];
  setWebPushClientForTests({
    setVapidDetails() {
      // noop
    },
    async sendNotification(_subscription, payload) {
      const parsed = JSON.parse(payload ?? "{}") as { title: string; body: string };
      notifications.push(parsed);
    },
  });

  try {
    await subscribeUser(userId, createSubscription("delay"));
    const result = await sendDelayAlert(userId, "UA122", 35);
    assert.equal(result, true);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.title, "Delay alert for UA122");
    assert.match(notifications[0]?.body ?? "", /35 minutes/);
  } finally {
    await unsubscribeUser(userId);
    setWebPushClientForTests(null);
    process.env.VAPID_PUBLIC_KEY = previousPublic;
    process.env.VAPID_PRIVATE_KEY = previousPrivate;
    process.env.VAPID_MAILTO = previousMailto;
  }
});

test("sendDepartureSoonAlert dispatches a push notification", async () => {
  const userId = `push-test-${randomUUID()}`;
  const previousPublic = process.env.VAPID_PUBLIC_KEY;
  const previousPrivate = process.env.VAPID_PRIVATE_KEY;
  const previousMailto = process.env.VAPID_MAILTO;
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  process.env.VAPID_MAILTO = "alerts@example.com";

  const notifications: Array<{ title: string; body: string }> = [];
  setWebPushClientForTests({
    setVapidDetails() {
      // noop
    },
    async sendNotification(_subscription, payload) {
      const parsed = JSON.parse(payload ?? "{}") as { title: string; body: string };
      notifications.push(parsed);
    },
  });

  try {
    await subscribeUser(userId, createSubscription("departure-soon"));
    const result = await sendDepartureSoonAlert(userId, "AA501", 45);
    assert.equal(result, true);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.title, "AA501 departs soon");
    assert.match(notifications[0]?.body ?? "", /45 minutes/);
  } finally {
    await unsubscribeUser(userId);
    setWebPushClientForTests(null);
    process.env.VAPID_PUBLIC_KEY = previousPublic;
    process.env.VAPID_PRIVATE_KEY = previousPrivate;
    process.env.VAPID_MAILTO = previousMailto;
  }
});
