/**
 * RevenueCat catalog for Kepi Pro / Concierge (Apple IAP via Capacitor).
 * Identifiers must match the RevenueCat dashboard + App Store Connect products.
 */

export const REVENUECAT_ENTITLEMENT_PRO = "kepi_pro";
export const REVENUECAT_ENTITLEMENT_CONCIERGE = "kepi_concierge";

/** Default App Store product ids — override with env if you rename in ASC. */
export function revenueCatProductIdForPlan(plan: "pro" | "concierge"): string {
  if (plan === "concierge") {
    return process.env.NEXT_PUBLIC_REVENUECAT_PRODUCT_CONCIERGE?.trim() || "kepi_concierge_monthly";
  }
  return process.env.NEXT_PUBLIC_REVENUECAT_PRODUCT_PRO?.trim() || "kepi_pro_monthly";
}

export function planFromRevenueCatEntitlements(
  entitlementIds: readonly string[] | null | undefined,
): "free" | "pro" | "concierge" {
  const ids = new Set((entitlementIds ?? []).map((id) => id.trim().toLowerCase()).filter(Boolean));
  if (ids.has(REVENUECAT_ENTITLEMENT_CONCIERGE.toLowerCase()) || ids.has("concierge")) {
    return "concierge";
  }
  if (ids.has(REVENUECAT_ENTITLEMENT_PRO.toLowerCase()) || ids.has("pro")) {
    return "pro";
  }
  return "free";
}

export const GRANTING_REVENUECAT_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "NON_RENEWING_PURCHASE",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "TRANSFER",
]);

export const EXPIRING_REVENUECAT_EVENT_TYPES = new Set(["EXPIRATION"]);
