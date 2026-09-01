"use client";

import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { LiveMapPage } from "@/components/travelAssistant/LiveMapPage";
import { leaveLiveMap } from "@/lib/travelAssistant/liveMapSession";
import { isStaleBundleError, recoverStaleClientBundle } from "@/lib/pwa/recoverStaleClientBundle";

function LiveMapLoading() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-100 text-slate-700"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="h-10 w-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
      <p className="mt-4 text-[17px] font-semibold">Loading family map…</p>
    </div>
  );
}

interface LiveMapErrorBoundaryState {
  hasError: boolean;
  detail: string | null;
}

class LiveMapErrorBoundary extends Component<{ children: ReactNode }, LiveMapErrorBoundaryState> {
  state: LiveMapErrorBoundaryState = { hasError: false, detail: null };

  static getDerivedStateFromError(error: Error): LiveMapErrorBoundaryState {
    return { hasError: true, detail: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[LiveMap]", error, info.componentStack);
    if (isStaleBundleError(error)) {
      void recoverStaleClientBundle();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const staleBundle = isStaleBundleError({ message: this.state.detail ?? undefined });

    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-slate-100 px-6 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <p className="text-[20px] font-bold text-slate-900">Map could not load</p>
        <p className="max-w-sm text-[16px] leading-relaxed text-slate-600">
          {staleBundle
            ? "An old app version is blocking the map. Reloading once with a fresh copy…"
            : "This can happen on older iPhones or when WebGL is disabled. Try closing other tabs, then reopen Kepi."}
        </p>
        {this.state.detail ? (
          <p className="max-w-sm text-xs leading-relaxed text-slate-500">{this.state.detail}</p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (staleBundle) {
              void recoverStaleClientBundle();
              return;
            }
            leaveLiveMap("home");
          }}
          className="min-h-[48px] rounded-2xl bg-[#007AFF] px-6 py-3 text-[17px] font-bold text-white shadow-lg"
        >
          {staleBundle ? "Reload map" : "Back to trip home"}
        </button>
      </div>
    );
  }
}

export default function LiveMapRoute() {
  return (
    <LiveMapErrorBoundary>
      <Suspense fallback={<LiveMapLoading />}>
        <LiveMapPage />
      </Suspense>
    </LiveMapErrorBoundary>
  );
}
