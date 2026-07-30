"use client";

import { Purchases, LOG_LEVEL, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { isIOS, isNative } from "@/lib/native/platform";
import { revenueCatProductIdForPlan } from "@/lib/billing/revenueCatCatalog";

let configuredForUser: string | null = null;

function iosApiKey(): string {
  return process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? "";
}

export function isRevenueCatIosReady(): boolean {
  return isNative() && isIOS() && Boolean(iosApiKey());
}

export async function ensureRevenueCatConfigured(appUserId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isNative() || !isIOS()) {
    return { ok: false, message: "RevenueCat IAP is only available in the iOS app." };
  }
  const apiKey = iosApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message: "RevenueCat is not configured yet (missing NEXT_PUBLIC_REVENUECAT_IOS_API_KEY).",
    };
  }
  const userId = appUserId.trim();
  if (!userId) {
    return { ok: false, message: "Sign in to purchase a plan." };
  }

  try {
    if (configuredForUser !== userId) {
      if (process.env.NODE_ENV !== "production") {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      }
      await Purchases.configure({ apiKey, appUserID: userId });
      configuredForUser = userId;
    } else {
      await Purchases.logIn({ appUserID: userId });
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not start App Store billing.",
    };
  }
}

async function findPackageForPlan(plan: "pro" | "concierge"): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;

  const productId = revenueCatProductIdForPlan(plan).toLowerCase();
  const packages = current.availablePackages ?? [];
  const byProduct = packages.find(
    (pkg) => (pkg.product?.identifier ?? "").toLowerCase() === productId,
  );
  if (byProduct) return byProduct;

  // Fallback: package identifier contains plan name
  const byId = packages.find((pkg) =>
    (pkg.identifier ?? "").toLowerCase().includes(plan === "concierge" ? "concierge" : "pro"),
  );
  return byId ?? packages[0] ?? null;
}

export type RevenueCatPurchaseResult =
  | { ok: true; entitlementIds: string[] }
  | { ok: false; message: string; cancelled?: boolean };

export async function purchasePlanViaRevenueCat(
  appUserId: string,
  plan: "pro" | "concierge",
): Promise<RevenueCatPurchaseResult> {
  const configured = await ensureRevenueCatConfigured(appUserId);
  if (!configured.ok) return configured;

  try {
    const pkg = await findPackageForPlan(plan);
    if (!pkg) {
      return {
        ok: false,
        message:
          "No App Store package found for this plan. Finish RevenueCat + App Store Connect product setup, then try again.",
      };
    }

    const result = await Purchases.purchasePackage({ aPackage: pkg });
    const entitlements = result.customerInfo?.entitlements?.active ?? {};
    const entitlementIds = Object.keys(entitlements);
    return { ok: true, entitlementIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase failed.";
    const cancelled = /cancel|cancelled|canceled/i.test(message);
    return { ok: false, message, cancelled };
  }
}

export async function restoreRevenueCatPurchases(
  appUserId: string,
): Promise<RevenueCatPurchaseResult> {
  const configured = await ensureRevenueCatConfigured(appUserId);
  if (!configured.ok) return configured;
  try {
    const info = await Purchases.restorePurchases();
    const entitlements = info.customerInfo?.entitlements?.active ?? {};
    return { ok: true, entitlementIds: Object.keys(entitlements) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Restore failed.",
    };
  }
}
