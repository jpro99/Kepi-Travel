import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAndroidNotificationSettingsGuide,
  buildBlockedNotificationHelp,
  readNotificationPermissionState,
  readNotificationSiteHostname,
} from "@/lib/push/webPushClient";

test("buildAndroidNotificationSettingsGuide explains Chrome tab is not Kepi Travel in Android app list", () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { hostname: "kepi-travel-preview.vercel.app" },
      matchMedia: () => ({ matches: false }),
    },
  });

  const message = buildAndroidNotificationSettingsGuide({ blocked: true });
  assert.match(message, /does not appear as its own app/i);
  assert.match(message, /Kepi Travel/i);
  assert.match(message, /Chrome/i);
  assert.match(message, /Site settings/i);
  assert.match(message, /Notifications/i);
  assert.match(message, /kepi-travel-preview\.vercel\.app/);
  assert.match(message, /Add to Home screen/i);
  assert.match(message, /own notification channel/i);

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("buildAndroidNotificationSettingsGuide for default permission mentions tap Enable first", () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { hostname: "kepitravel.com" },
      matchMedia: () => ({ matches: false }),
    },
  });

  const message = buildAndroidNotificationSettingsGuide({ blocked: false });
  assert.match(message, /Tap Enable here first/i);
  assert.match(message, /kepitravel\.com/);

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("buildBlockedNotificationHelp on Android uses site hostname not hardcoded production only", () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { hostname: "my-preview.vercel.app" },
      matchMedia: () => ({ matches: false }),
    },
  });

  const message = buildBlockedNotificationHelp();
  assert.match(message, /my-preview\.vercel\.app/);
  assert.doesNotMatch(message, /kepitravel\.com/);

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("readNotificationSiteHostname returns window hostname", () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { hostname: "kepi-travel-preview.vercel.app" } },
  });
  assert.equal(readNotificationSiteHostname(), "kepi-travel-preview.vercel.app");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("buildBlockedNotificationHelp on desktop Safari uses hostname and address-bar settings path", () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { hostname: "kepi-travel-preview.vercel.app" },
      matchMedia: () => ({ matches: false }),
    },
  });

  const message = buildBlockedNotificationHelp();
  assert.match(message, /kepi-travel-preview\.vercel\.app/);
  assert.match(message, /address bar/i);
  assert.match(message, /Notifications/i);

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("readNotificationPermissionState returns unsupported without Notification API", () => {
  const originalNotification = (globalThis as { Notification?: unknown }).Notification;
  (globalThis as { Notification?: unknown }).Notification = undefined;

  assert.equal(readNotificationPermissionState(), "unsupported");

  (globalThis as { Notification?: unknown }).Notification = originalNotification;
});
