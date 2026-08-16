export const TDZ_RELOAD_KEY = "kepi:tdz-bundle-reload";

export function isStaleBundleError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? "";
  return /before initialization/i.test(message);
}

export async function recoverStaleClientBundle(options?: {
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  reload?: () => void;
  caches?: Pick<CacheStorage, "keys" | "delete"> | null;
  serviceWorker?: Pick<ServiceWorkerContainer, "getRegistrations" | "controller"> | null;
}): Promise<boolean> {
  const storage =
    options?.storage !== undefined
      ? options.storage
      : typeof sessionStorage === "undefined"
        ? null
        : sessionStorage;
  if (storage?.getItem(TDZ_RELOAD_KEY) === "1") return false;
  storage?.setItem(TDZ_RELOAD_KEY, "1");

  try {
    const sw =
      options?.serviceWorker !== undefined
        ? options.serviceWorker
        : typeof navigator === "undefined"
          ? null
          : navigator.serviceWorker;
    sw?.controller?.postMessage("CLEAR_ALL_CACHES");
    if (sw) {
      const registrations = await sw.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    const cacheApi =
      options?.caches !== undefined
        ? options.caches
        : typeof caches === "undefined"
          ? null
          : caches;
    if (cacheApi) {
      const keys = await cacheApi.keys();
      await Promise.all(keys.map((key) => cacheApi.delete(key)));
    }
  } catch {
    /* still reload — a half-cleared cache is better than a stuck red screen */
  }

  const reload = options?.reload ?? (() => window.location.reload());
  reload();
  return true;
}
