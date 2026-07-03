"use client";

import { useEffect, useState } from "react";
import { LoyaltyWallet } from "@/components/loyalty/LoyaltyWallet";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";

export function LoyaltyWalletSection() {
  const [balances, setBalances] = useState<LoyaltyBalance[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/loyalty")
      .then((r) => r.json())
      .then((d) => {
        if (d.balances) setBalances(d.balances);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const handleUpdate = async (next: LoyaltyBalance[]) => {
    const res = await fetch("/api/loyalty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balances: next }),
    });
    if (!res.ok) {
      throw new Error("Failed to save loyalty wallet");
    }
    const data = (await res.json()) as { balances?: LoyaltyBalance[] };
    setBalances(Array.isArray(data.balances) ? data.balances : next);
  };

  if (!loaded) return <p className="text-sm text-slate-400 py-2">Loading wallet…</p>;
  return <LoyaltyWallet balances={balances} onUpdate={handleUpdate} />;
}
