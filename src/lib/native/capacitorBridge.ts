"use client";

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";

// Re-export canonical detection helpers so callers can import from one place.
export { isNative, isIOS, isAndroid, isAppMode, setStatusBarStyle } from "@/lib/native/platform";

type NativePlatform = "ios" | "android";

interface NativePushTokenResult {
  token: string;
  platform: NativePlatform;
}

interface LocalNotificationArgs {
  title: string;
  body: string;
  id?: number;
  scheduleAt?: Date;
}

function resolveNativePlatform(): NativePlatform | null {
  const platform = Capacitor.getPlatform();
  if (platform === "ios" || platform === "android") {
    return platform;
  }
  return null;
}

export async function triggerHaptic(style: "light" | "medium" | "heavy" = "light"): Promise<void> {
  if (isNative()) {
    const impactStyle =
      style === "heavy" ? ImpactStyle.Heavy : style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
    try {
      await Haptics.impact({ style: impactStyle });
    } catch {
      // Ignore haptic failures on unsupported devices.
    }
    return;
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const duration = style === "heavy" ? 40 : style === "medium" ? 24 : 12;
    navigator.vibrate(duration);
  }
}

export async function scheduleLocalNotification(args: LocalNotificationArgs): Promise<void> {
  if (isNative()) {
    try {
      const permissions = await LocalNotifications.checkPermissions();
      if (permissions.display !== "granted") {
        const request = await LocalNotifications.requestPermissions();
        if (request.display !== "granted") {
          return;
        }
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: args.id ?? Date.now(),
            title: args.title,
            body: args.body,
            schedule: args.scheduleAt ? { at: args.scheduleAt } : undefined,
          },
        ],
      });
    } catch {
      // Ignore notification scheduling errors in unsupported native contexts.
    }
    return;
  }

  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }
  const run = () => new Notification(args.title, { body: args.body });
  if (args.scheduleAt && args.scheduleAt.getTime() > Date.now()) {
    window.setTimeout(run, args.scheduleAt.getTime() - Date.now());
  } else {
    run();
  }
}

export async function registerPushToken(): Promise<NativePushTokenResult | null> {
  if (!isNative()) {
    return null;
  }
  const platform = resolveNativePlatform();
  if (!platform) {
    return null;
  }

  const permissions = await PushNotifications.checkPermissions();
  if (permissions.receive !== "granted") {
    const request = await PushNotifications.requestPermissions();
    if (request.receive !== "granted") {
      return null;
    }
  }

  return new Promise<NativePushTokenResult | null>((resolve) => {
    let finished = false;
    const cleanup = async (): Promise<void> => {
      const [registrationHandle, registrationErrorHandle] = await Promise.all([
        registrationHandlePromise,
        registrationErrorHandlePromise,
      ]);
      await Promise.allSettled([registrationHandle.remove(), registrationErrorHandle.remove()]);
    };
    const finish = (result: NativePushTokenResult | null) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      void cleanup();
      resolve(result);
    };
    const registrationHandlePromise = PushNotifications.addListener("registration", (token) => {
      finish({ token: token.value, platform });
    });
    const registrationErrorHandlePromise = PushNotifications.addListener("registrationError", () => {
      finish(null);
    });
    const timeout = window.setTimeout(() => finish(null), 10000);
    void PushNotifications.register().catch(() => finish(null));
  });
}
