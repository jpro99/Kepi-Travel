"use client";

import { useUser } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Plan, PlanFeature, BillingUsage } from "@/lib/billing/plans";

interface UpgradeModalGateContext {
  feature: PlanFeature;
  detail?: string;
}

interface BillingContextValue {
  plan: Plan | null;
  usage: BillingUsage | null;
  isPro: boolean;
  isTrial: boolean;
  isLifetime: boolean;
  hasProAccess: boolean;
  billingStatus: { plan: Plan | null; usage: BillingUsage | null } | null;
  upgradeModalGate: UpgradeModalGateContext | null;
  setUpgradeModalGate: (gate: UpgradeModalGateContext | null) => void;
  openUpgradeModal: (feature: PlanFeature, detail?: string) => void;
  refresh: () => Promise<void>;
}

const BillingContext = createContext<BillingContextValue | undefined>(undefined);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [upgradeModalGate, setUpgradeModalGate] = useState<UpgradeModalGateContext | null>(null);

  const fetchBillingStatus = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    try {
      const response = await fetch("/api/billing/status");
      if (response.ok) {
        const { plan, usage } = await response.json();
        setPlan(plan);
        setUsage(usage);
      }
    } catch {
      // Silently fail
    }
  }, [user?.id]);

  useEffect(() => {
    if (isLoaded && user) {
      void fetchBillingStatus();
    }
  }, [isLoaded, user, fetchBillingStatus]);

  const isPro = useMemo(() => plan?.id !== "free", [plan]);
  const isTrial = useMemo(() => plan?.trial === true, [plan]);
  const isLifetime = useMemo(() => plan?.id === "lifetime", [plan]);
  const hasProAccess = useMemo(() => isPro || isTrial || isLifetime, [isPro, isTrial, isLifetime]);

  const openUpgradeModal = useCallback(
    (feature: PlanFeature, detail?: string) => {
      if (!hasProAccess) {
        setUpgradeModalGate({ feature, detail });
      }
    },
    [hasProAccess]
  );

  const value = useMemo(
    () => ({
      plan,
      usage,
      isPro,
      isTrial,
      isLifetime,
      hasProAccess,
      billingStatus: { plan, usage },
      upgradeModalGate,
      setUpgradeModalGate,
      openUpgradeModal,
      refresh: fetchBillingStatus,
    }),
    [plan, usage, isPro, isTrial, isLifetime, hasProAccess, upgradeModalGate, openUpgradeModal, fetchBillingStatus]
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  const context = useContext(BillingContext);
  if (context === undefined) {
    throw new Error("useBilling must be used within a BillingProvider");
  }
  return context;
}
