/**
 * App Store / Play billing gate.
 * Digital Pro/Concierge unlocks sold inside a native iOS binary must use Apple IAP (guideline 3.1.1).
 * Until RevenueCat/StoreKit ships, refuse Stripe checkout from Capacitor iOS.
 */

import { isIOS, isNative } from "@/lib/native/platform";

export type ClientBillingPlatform = "web" | "ios_native" | "android_native" | "unknown";

export function resolveClientBillingPlatform(
  input?: string | null,
): ClientBillingPlatform {
  const normalized = (input ?? "").trim().toLowerCase();
  if (normalized === "ios_native" || normalized === "ios") return "ios_native";
  if (normalized === "android_native" || normalized === "android") return "android_native";
  if (normalized === "web") return "web";
  return "unknown";
}

/** True when this client must not open Stripe Checkout for digital subscriptions. */
export function mustBlockStripeDigitalCheckout(
  platform: ClientBillingPlatform = detectClientBillingPlatform(),
): boolean {
  return platform === "ios_native";
}

export function detectClientBillingPlatform(): ClientBillingPlatform {
  if (typeof window === "undefined") return "unknown";
  if (isNative() && isIOS()) return "ios_native";
  if (isNative()) return "android_native";
  return "web";
}

export const IOS_IAP_REQUIRED_MESSAGE =
  "Subscriptions on the iOS app must use Apple In-App Purchase. Open kepitravel.com in Safari to manage billing on the web for now, or wait for App Store billing (coming next).";
