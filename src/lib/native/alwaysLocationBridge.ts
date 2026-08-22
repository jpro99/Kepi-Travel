import { isFamilySharingActive } from "@/lib/family/locationSharingPrefs";
import { isJourneyCheckInActive } from "@/lib/family/journeyCheckInPrefs";
import { isNative } from "@/lib/native/platform";

type KepiLocationBridge = {
  postMessage: (message: Record<string, unknown>) => void;
};

function nativeBridge(): KepiLocationBridge | null {
  if (typeof window === "undefined") return null;
  const handler = (
    window as unknown as {
      webkit?: { messageHandlers?: { kepiLocation?: KepiLocationBridge } };
    }
  ).webkit?.messageHandlers?.kepiLocation;
  return handler ?? null;
}

/** True in the TestFlight / Xcode shell that can run Always GPS. */
export function isNativeAlwaysLocationAvailable(): boolean {
  return nativeBridge() !== null || isNative();
}

export async function syncNativeAlwaysLocation(): Promise<void> {
  const bridge = nativeBridge();
  if (!bridge) return;
  // Either consent independently keeps the tracker running — sharing with
  // family and self journey check-ins are separate opt-ins, and stopping
  // one must not silently kill location for whichever one is still active.
  if (!isFamilySharingActive() && !isJourneyCheckInActive()) {
    bridge.postMessage({ action: "stop" });
    return;
  }
  try {
    const res = await fetch("/api/family/location-session", { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { token?: string };
    if (!data.token) return;
    bridge.postMessage({
      action: "start",
      token: data.token,
      url: "https://kepitravel.com/api/family/native-location",
    });
  } catch {
    /* native tracker keeps the last token */
  }
}

export function stopNativeAlwaysLocation(): void {
  nativeBridge()?.postMessage({ action: "stop" });
}
