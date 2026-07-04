"use client";

import { useEffect, useState } from "react";

export interface BrowserConnectivityState {
  isOnline: boolean;
  /** True once we've read navigator.onLine in the browser. */
  ready: boolean;
}

export function useBrowserConnectivity(): BrowserConnectivityState {
  const [state, setState] = useState<BrowserConnectivityState>({
    isOnline: true,
    ready: false,
  });

  useEffect(() => {
    const sync = (): void => {
      setState({ isOnline: navigator.onLine, ready: true });
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return state;
}
