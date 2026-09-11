import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlockedNotificationHelp,
  readNotificationPermissionState,
} from "@/lib/push/webPushClient";

test("buildBlockedNotificationHelp mentions Chrome site settings on Android", () => {
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile" },
  });

  const message = buildBlockedNotificationHelp();
  assert.match(message, /blocked/i);
  assert.match(message, /Chrome/i);
  assert.match(message, /Notifications/i);

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

test("readNotificationPermissionState returns unsupported without Notification API", () => {
  const originalNotification = (globalThis as { Notification?: unknown }).Notification;
  (globalThis as { Notification?: unknown }).Notification = undefined;

  assert.equal(readNotificationPermissionState(), "unsupported");

  (globalThis as { Notification?: unknown }).Notification = originalNotification;
});
