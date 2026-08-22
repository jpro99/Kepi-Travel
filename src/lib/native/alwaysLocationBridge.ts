import { isFamilySharingActive } from "@/lib/family/locationSharingPrefs";
import { isJourneyCheckInActive } from "@/lib/family/journeyCheckInPrefs";
import { isNative } from "@/lib/native/platform";

const NATIVE_LOCATION_URL = "https://kepitravel.com/api/family/native-location";

// iOS bridge: a WKScriptMessageHandler registered in KepiBridgeViewController.swift,
// receiving {action, token, url} exactly like the Android plugin below.
type WebkitLocationBridge = {
  postMessage: (message: Record<string, unknown>) => void;
};

function webkitBridge(): WebkitLocationBridge | null {
  if (typeof window === "undefined") return null;
  const handler = (
    window as unknown as {
      webkit?: { messageHandlers?: { kepiLocation?: WebkitLocationBridge } };
    }
  ).webkit?.messageHandlers?.kepiLocation;
  return handler ?? null;
}

// Android bridge: KepiLocationPlugin.java, registered as a Capacitor plugin
// (app-local — no @capacitor/* npm package, just Capacitor.Plugins.KepiLocation).
type AndroidLocationPlugin = {
  start: (options: { token: string; url: string }) => Promise<void>;
  stop: () => Promise<void>;
};

function androidPlugin(): AndroidLocationPlugin | null {
  if (typeof window === "undefined") return null;
  const plugin = (
    window as unknown as {
      Capacitor?: { Plugins?: { KepiLocation?: AndroidLocationPlugin } };
    }
  ).Capacitor?.Plugins?.KepiLocation;
  return plugin ?? null;
}

/** True in the TestFlight/Xcode iOS shell or the native Android app that can run Always GPS. */
export function isNativeAlwaysLocationAvailable(): boolean {
  return webkitBridge() !== null || androidPlugin() !== null || isNative();
}

export async function syncNativeAlwaysLocation(): Promise<void> {
  const ios = webkitBridge();
  const android = androidPlugin();
  if (!ios && !android) return;

  if (!isFamilySharingActive() && !isJourneyCheckInActive()) {
    ios?.postMessage({ action: "stop" });
    void android?.stop().catch(() => undefined);
    return;
  }

  try {
    const res = await fetch("/api/family/location-session", { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { token?: string };
    if (!data.token) return;

    if (ios) {
      ios.postMessage({ action: "start", token: data.token, url: NATIVE_LOCATION_URL });
    }
    if (android) {
      // Android's runtime location-permission dialog is async — start()
      // resolves only after the user responds (or immediately if already
      // granted). Fire-and-forget here; the plugin handles its own
      // permission flow and simply never starts tracking if denied.
      void android.start({ token: data.token, url: NATIVE_LOCATION_URL }).catch(() => undefined);
    }
  } catch {
    /* native tracker keeps the last token */
  }
}

export function stopNativeAlwaysLocation(): void {
  webkitBridge()?.postMessage({ action: "stop" });
  void androidPlugin()
    ?.stop()
    .catch(() => undefined);
}
