"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { isStaleBundleError, recoverStaleClientBundle } from "@/lib/pwa/recoverStaleClientBundle";

interface PlanTabErrorBoundaryProps {
  children: ReactNode;
}

interface PlanTabErrorBoundaryState {
  error: Error | null;
}

export class PlanTabErrorBoundary extends Component<
  PlanTabErrorBoundaryProps,
  PlanTabErrorBoundaryState
> {
  state: PlanTabErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PlanTabErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    if (isStaleBundleError(error)) {
      void recoverStaleClientBundle();
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <section className="rounded-2xl bg-[#F5F5F7] px-5 py-6">
        <h2 className="text-[22px] font-semibold text-[#1D1D1F]">Plan needs a refresh</h2>
        <p className="mt-2 text-[16px] text-[#6E6E73]">
          A leftover app update is blocking this tab. Reload once — hotel and flight
          confirmations stay as they are.
        </p>
        <button
          type="button"
          onClick={() => {
            void recoverStaleClientBundle();
          }}
          className="mt-4 min-h-[48px] rounded-full bg-[#007AFF] px-5 text-[16px] font-semibold text-white"
        >
          Reload Plan
        </button>
      </section>
    );
  }
}
