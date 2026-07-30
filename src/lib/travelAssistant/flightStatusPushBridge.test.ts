import assert from "node:assert/strict";
import test from "node:test";
import { resetAdminUserIdsCacheForTests } from "@/lib/admin/adminAccess";
import { maybeSendFlightStatusPushAlerts } from "@/lib/travelAssistant/flightStatusPushBridge";
import {
  setWebPushClientForTests,
  subscribeUser,
  unsubscribeUser,
} from "@/lib/travelAssistant/pushNotificationService";
import { generateId } from "@/lib/utils/generateId";

function createSubscription(suffix: string) {
  return {
    endpoint: `https://push.example.com/${suffix}`,
    keys: {
      p256dh: "test-p256dh",
      auth: "test-auth",
    },
  };
}

function uniqueFlightNumber(prefix: string): string {
  return `${prefix}${generateId().replace(/[^a-zA-Z0-9]/gu, "").slice(0, 6).toUpperCase()}`;
}

async function withIsolatedAdminPush(
  run: (ctx: {
    userId: string;
    flightNumber: string;
    notifications: Array<{ title: string; body: string }>;
  }) => Promise<void>,
): Promise<void> {
  const userId = `push-admin-${generateId()}`;
  const flightNumber = uniqueFlightNumber("T");
  const previousAdmin = process.env.ADMIN_USER_IDS;
  const previousPublic = process.env.VAPID_PUBLIC_KEY;
  const previousPrivate = process.env.VAPID_PRIVATE_KEY;
  const previousMailto = process.env.VAPID_MAILTO;

  process.env.ADMIN_USER_IDS = userId;
  resetAdminUserIdsCacheForTests();
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
      notifications.push({ title: parsed.title, body: parsed.body });
    },
  });

  try {
    await subscribeUser(userId, createSubscription(userId));
    await run({ userId, flightNumber, notifications });
  } finally {
    await unsubscribeUser(userId);
    setWebPushClientForTests(null);
    process.env.ADMIN_USER_IDS = previousAdmin;
    resetAdminUserIdsCacheForTests();
    process.env.VAPID_PUBLIC_KEY = previousPublic;
    process.env.VAPID_PRIVATE_KEY = previousPrivate;
    process.env.VAPID_MAILTO = previousMailto;
  }
}

test("flight status push bridge stores baseline without alerting", async () => {
  await withIsolatedAdminPush(async ({ userId, flightNumber }) => {
    const first = await maybeSendFlightStatusPushAlerts(userId, {
      flightNumber,
      flightDate: "2026-07-01",
      departureGate: "C12",
      delayMinutes: 0,
      flightStatus: "scheduled",
    });
    assert.equal(first.sent, 0);
    assert.equal(first.skippedReason, "baseline");
  });
});

test("flight status push bridge skips without pro subscription or push registration", async () => {
  const userId = `flight-push-${generateId()}`;
  await maybeSendFlightStatusPushAlerts(userId, {
    flightNumber: "AS832",
    flightDate: "2026-07-02",
    departureGate: "C12",
    delayMinutes: 0,
    flightStatus: "scheduled",
  });
  const second = await maybeSendFlightStatusPushAlerts(userId, {
    flightNumber: "AS832",
    flightDate: "2026-07-02",
    departureGate: "D4",
    delayMinutes: 0,
    flightStatus: "boarding",
  });
  assert.equal(second.sent, 0);
  assert.ok(second.skippedReason === "plan" || second.skippedReason === "no-subscription");
});

test("flight status push bridge alerts once on gate change for same flightDate (F13)", async () => {
  await withIsolatedAdminPush(async ({ userId, flightNumber, notifications }) => {
    const baseline = await maybeSendFlightStatusPushAlerts(userId, {
      flightNumber,
      flightDate: "2026-09-14",
      departureGate: "C12",
      delayMinutes: 0,
      flightStatus: "scheduled",
    });
    assert.equal(baseline.sent, 0);
    assert.equal(baseline.skippedReason, "baseline");

    const changed = await maybeSendFlightStatusPushAlerts(userId, {
      flightNumber,
      flightDate: "2026-09-14",
      departureGate: "D4",
      delayMinutes: 0,
      flightStatus: "scheduled",
    });
    assert.equal(changed.sent, 1, `expected gate push, got ${JSON.stringify(changed)}`);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0]?.title ?? "", /Gate changed/i);
    assert.match(notifications[0]?.body ?? "", /D4/);

    const otherDay = await maybeSendFlightStatusPushAlerts(userId, {
      flightNumber,
      flightDate: "2026-09-15",
      departureGate: "E1",
      delayMinutes: 0,
      flightStatus: "scheduled",
    });
    assert.equal(otherDay.sent, 0);
    assert.equal(otherDay.skippedReason, "baseline");
    assert.equal(notifications.length, 1);
  });
});
