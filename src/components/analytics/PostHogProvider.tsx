"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

let initialized = false;

export function initPostHog(): void {
  if (initialized || !KEY || typeof window === "undefined") return;
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
  });
  initialized = true;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);
  return <>{children}</>;
}

export function capturePostHogEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!KEY || typeof window === "undefined") return;
  try {
    initPostHog();
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break product flows.
  }
}
