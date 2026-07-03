/** Read true-north compass heading from a DeviceOrientationEvent (iOS + Android). */
export function readCompassHeading(event: DeviceOrientationEvent): number | null {
  const ios = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof ios === "number" && Number.isFinite(ios)) {
    return ((ios % 360) + 360) % 360;
  }

  if (event.absolute && event.alpha != null && Number.isFinite(event.alpha)) {
    // alpha: 0 when device points north (most browsers with absolute orientation)
    return ((360 - event.alpha) % 360 + 360) % 360;
  }

  if (event.alpha != null && Number.isFinite(event.alpha)) {
    return ((event.alpha % 360) + 360) % 360;
  }

  return null;
}

export async function requestDeviceOrientationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
    return false;
  }

  const requestPermission = (
    DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<PermissionState> }
  ).requestPermission;

  if (typeof requestPermission === "function") {
    try {
      const state = await requestPermission();
      return state === "granted";
    } catch {
      return false;
    }
  }

  return true;
}
