"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ExpirationAlert } from "@/app/api/loyalty/alerts/route";

export function ConciergeBar() {
  const [alerts, setAlerts] = useState<ExpirationAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/loyalty/alerts")
      .then(r => r.json())
      .then(d => { if (d.alerts) setAlerts(d.alerts); })
      .catch(() => {});
  }, []);

  const visible = alerts.filter(a => !dismissed.has(a.programId));
  if (!visible.length) return null;

  const critical = visible.filter(a => a.urgency === "critical");
  const top = critical[0] ?? visible[0]!;

  const colors = {
    critical: { bg: "bg-red-950/40 border-red-500/50", text: "text-red-300", dot: "bg-red-500" },
    warning: { bg: "bg-amber-950/30 border-amber-400/40", text: "text-amber-300", dot: "bg-amber-400" },
    watch: { bg: "bg-blue-950/30 border-blue-500/30", text: "text-blue-300", dot: "bg-blue-400" },
  };

  const style = colors[top.urgency];

  return (
    <div className={`rounded-2xl border ${style.bg} px-4 py-3.5 mb-4`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${style.dot} ${top.urgency === "critical" ? "animate-pulse" : ""}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${style.text}`}>
            ⚠️ {top.programName} miles expire in {top.daysLeft} day{top.daysLeft !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {top.miles.toLocaleString()} miles worth ~${top.cashValue.toLocaleString()} — {top.action}
          </p>
          {visible.length > 1 && (
            <p className="text-xs text-slate-500 mt-0.5">
              +{visible.length - 1} more program{visible.length > 2 ? "s" : ""} expiring soon
            </p>
          )}
        </div>
        <button type="button" onClick={() => setDismissed(prev => new Set([...prev, top.programId]))}
          className="text-slate-600 text-sm shrink-0 mt-0.5">
          ✕
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <Link href="/book"
          className="flex-1 text-center py-2 rounded-xl bg-[#f4c95d] text-[#0b1f3a] text-xs font-black">
          Use miles now →
        </Link>
        <Link href="/travel-assistant?tab=more"
          className="flex-1 text-center py-2 rounded-xl border border-slate-600 text-slate-300 text-xs font-bold">
          Manage wallet
        </Link>
      </div>
    </div>
  );
}

// Concierge upsell — shown in trip tab when on free plan and disruption detected
export function ConciergeUpsell({ type: _type }: { type: "cancellation" | "delay" | "connection" }) {
  // Concierge tier not yet live — hiding upsell
  return null;
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const messages = {
    cancellation: "Flight cancelled? Concierge members get a human expert on the phone in 5 minutes.",
    delay: "Major delays are stressful. Kepi Concierge handles rebooking so you don't have to.",
    connection: "Tight connection? Concierge members get proactive rebooking before they even land.",
  };

  return (
    <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 px-4 py-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-black text-purple-300 uppercase tracking-widest">Kepi Concierge</p>
          <p className="text-sm font-bold text-white mt-1">{messages[type]}</p>
        </div>
        <button type="button" onClick={() => setDismissed(true)} className="text-slate-600 text-sm shrink-0">✕</button>
      </div>
      <Link href="/billing"
        className="block text-center py-2.5 rounded-xl bg-purple-600 text-white text-sm font-black active:opacity-80">
        Upgrade to Concierge — $49/mo
      </Link>
      <p className="text-[10px] text-slate-500 text-center mt-2">
        Includes Pro features + 24/7 human travel expert on call
      </p>
    </div>
  );
}
