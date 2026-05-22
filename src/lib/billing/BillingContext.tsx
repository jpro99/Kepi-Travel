"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BILLING_PLANS,
  type BillingPlanDefinition,
  type BillingPlanId,
  type BillingStatusPlan,
  type PlanFeature,
} from "@/lib/billing/plans";
import { KEPI_PLAN_COOKIE_NAME, readCookieValue, isLifetimePlanCookieValue } from "@/lib/billing/planCookie";

export interface BillingStatusPayload {
  plan: BillingStatusPlan;
  basePlan: BillingPlanId;
  definition: BillingPlanDefinition;
  usage: {
    tripCount: number;
    tripLimit: number | null;
    tripsRemaining: number | null;
  };
  features: Array<{
    feature: PlanFeature;
    label: string;
    requiresPro: boolean;
    enabled: boolean;
  }>;
  subscription: {
    plan: BillingPlanId;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    validUntil: string | null;
    lifetimePlan: boolean;
    trialExpiresAt: string | null;
  };
  inviteAccess: {
    lifetimePlanActive: boolean;
    trialActive: boolean;
    trialExpiresAt: string | null;
  };
  trialDaysRemaining: number | null;
  nextBillingDate: string | null;
  hasProAccess: boolean;
  stripeConfigured: boolean;
  stripePlansConfigured?: {
    pro: boolean;
    concierge: boolean;
  };
}

interface BillingContextValue {
  status: BillingStatusPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  plan: BillingStatusPlan;
  basePlan: BillingPlanId;
  hasProAccess: boolean;
  isLifetime: boolean;
  isTrial: boolean;
}

const BillingContext = createContext<BillingContextValue | null>(null);

function defaultFreeStatus(): BillingStatusPayload {
  return {
    plan: "free",
    basePlan: "free",
    definition: BILLING_PLANS.free,
    usage: {
      tripCount: 0,
      tripLimit: 1,
      tripsRemaining: 1,
    },
    features: [],
    subscription: {
      plan: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      validUntil: null,
      lifetimePlan: false,
      trialExpiresAt: null,
    },
    inviteAccess: {
      lifetimePlanActive: false,
      trialActive: false,
      trialExpiresAt: null,
    },
    trialDaysRemaining: null,
    nextBillingDate: null,
    hasProAccess: false,
    stripeConfigured: false,
    stripePlansConfigured: {
      pro: false,
      concierge: false,
    },
  };
}

function lifetimeCookieStatusFallback(): BillingStatusPayload {
  const fallback = defaultFreeStatus();
  return {
    ...fallback,
    plan: "lifetime",
    basePlan: "pro",
    definition: BILLING_PLANS.pro,
    subscription: {
      ...fallback.subscription,
      plan: "pro",
      lifetimePlan: true,
      trialExpiresAt: null,
      validUntil: null,
    },
    inviteAccess: {
      lifetimePlanActive: true,
      trialActive: false,
      trialExpiresAt: null,
    },
    trialDaysRemaining: null,
    nextBillingDate: null,
    hasProAccess: true,
  };
}

function hasLifetimePlanCookieInBrowser(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const cookieValue = readCookieValue(document.cookie, KEPI_PLAN_COOKIE_NAME);
  return isLifetimePlanCookieValue(cookieValue);
}

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const [status, setStatus] = useState<BillingStatusPayload | null>(() =>
    hasLifetimePlanCookieInBrowser() ? lifetimeCookieStatusFallback() : null,
  );
  const [loading, setLoading] = useState(() => !hasLifetimePlanCookieInBrowser());
  const [error, setError] = useState<string | null>(null);
  const fetchedForUserRef = useRef<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (hasLifetimePlanCookieInBrowser()) {
      setStatus((previous) => previous ?? lifetimeCookieStatusFallback());
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/status", {
        method: "GET",
        cache: "no-store",
      });
      if (response.status === 401) {
        setStatus(null);
        setLoading(false);
        return;
      }
      const payload = (await response.json()) as Partial<BillingStatusPayload> & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Billing status failed (${response.status})`);
      }
      const mergedStatus: BillingStatusPayload = {
        ...defaultFreeStatus(),
        ...payload,
        definition:
          payload.definition && typeof payload.definition === "object"
            ? (payload.definition as BillingPlanDefinition)
            : BILLING_PLANS.free,
      };
      setStatus(mergedStatus);
    } catch (refreshError) {
      setStatus(null);
      setError(refreshError instanceof Error ? refreshError.message : "Could not load billing status.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!userId) {
      fetchedForUserRef.current = null;
      const timeout = window.setTimeout(() => {
        setStatus(null);
        setError(null);
        setLoading(false);
      }, 0);
      return () => {
        window.clearTimeout(timeout);
      };
    }
    if (fetchedForUserRef.current === userId) {
      return;
    }
    fetchedForUserRef.current = userId;
    void refresh();
  }, [isLoaded, refresh, userId]);

  const value = useMemo<BillingContextValue>(() => {
    const plan = status?.plan ?? "free";
    const basePlan = status?.basePlan ?? "free";
    return {
      status,
      loading,
      error,
      refresh,
      plan,
      basePlan,
      hasProAccess: status?.hasProAccess ?? false,
      isLifetime: plan === "lifetime",
      isTrial: plan === "trial",
    };
  }, [error, loading, refresh, status]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error("useBilling must be used within BillingProvider.");
  }
  return context;
}
