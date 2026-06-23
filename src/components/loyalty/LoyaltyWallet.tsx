"use client";

import { useState } from "react";
import { LOYALTY_PROGRAMS } from "@/lib/loyalty/programs";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";

interface LoyaltyWalletProps {
  balances: LoyaltyBalance[];
  onUpdate: (balances: LoyaltyBalance[]) => Promise<void>;
}

export function LoyaltyWallet({ balances, onUpdate }: LoyaltyWalletProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [tempMiles, setTempMiles] = useState("");
  const [tempTier, setTempTier] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const getBalance = (id: string) => balances.find(b => b.programId === id);

  const save = async (programId: string) => {
    const miles = parseInt(tempMiles.replace(/,/g, ""), 10);
    if (isNaN(miles) || miles < 0) return;
    setSaving(true);
    const next = balances.filter(b => b.programId !== programId);
    if (miles > 0) next.push({ programId, miles, tier: tempTier || undefined });
    await onUpdate(next);
    setSaving(false);
    setEditing(null);
  };

  const remove = async (programId: string) => {
    setSaving(true);
    await onUpdate(balances.filter(b => b.programId !== programId));
    setSaving(false);
  };

  const activePrograms = LOYALTY_PROGRAMS.filter(p => getBalance(p.id));
  const inactivePrograms = LOYALTY_PROGRAMS.filter(p => !getBalance(p.id));

  const totalCashValue = balances.reduce((sum, b) => {
    const prog = LOYALTY_PROGRAMS.find(p => p.id === b.programId);
    return sum + (prog ? (b.miles * prog.cppEstimate / 100) : 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Total value banner */}
      {totalCashValue > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-[#1a2f4a] to-[#0f1e35] border border-[#f4c95d]/20 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Your points portfolio</p>
          <p className="text-3xl font-black text-white mt-1">${Math.round(totalCashValue).toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">estimated cash value across {balances.length} program{balances.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      {/* Active programs */}
      {activePrograms.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Your programs</p>
          {activePrograms.map(prog => {
            const bal = getBalance(prog.id)!;
            const cashVal = Math.round(bal.miles * prog.cppEstimate / 100);
            const isEdit = editing === prog.id;
            return (
              <div key={prog.id} className="rounded-2xl border border-slate-700 bg-[#111e33]">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="text-2xl">{prog.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{prog.shortName}</p>
                    {bal.tier && <p className="text-xs text-[#f4c95d]">{bal.tier}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-white">{bal.miles.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">≈ ${cashVal.toLocaleString()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditing(isEdit ? null : prog.id); setTempMiles(bal.miles.toLocaleString()); setTempTier(bal.tier ?? ""); }}
                    className="ml-2 text-slate-500 text-xs"
                  >
                    {isEdit ? "Cancel" : "Edit"}
                  </button>
                </div>
                {isEdit && (
                  <div className="border-t border-slate-700 px-4 py-3 space-y-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500">Balance</label>
                      <input
                        type="text"
                        value={tempMiles}
                        onChange={e => setTempMiles(e.target.value)}
                        placeholder="e.g. 45000"
                        className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f4c95d]/50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500">Status tier (optional)</label>
                      <input
                        type="text"
                        value={tempTier}
                        onChange={e => setTempTier(e.target.value)}
                        placeholder="e.g. MVP Gold, 1K, Diamond"
                        className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f4c95d]/50"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => save(prog.id)} disabled={saving}
                        className="flex-1 py-2 rounded-xl bg-[#f4c95d] text-[#0b1f3a] text-sm font-bold disabled:opacity-50">
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button type="button" onClick={() => remove(prog.id)} disabled={saving}
                        className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm">
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add program */}
      <button type="button" onClick={() => setShowAdd(!showAdd)}
        className="w-full rounded-2xl border border-dashed border-slate-600 py-3.5 text-sm font-bold text-slate-400 active:opacity-70">
        {showAdd ? "↑ Hide" : "+ Add loyalty program"}
      </button>

      {showAdd && (
        <div className="space-y-1">
          {["transferable", "airline", "hotel"].map(type => (
            <div key={type}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 px-1 py-2">
                {type === "transferable" ? "💳 Credit card points" : type === "airline" ? "✈️ Airline miles" : "🏨 Hotel points"}
              </p>
              {inactivePrograms.filter(p => p.type === type).map(prog => (
                <button key={prog.id} type="button"
                  onClick={() => { setShowAdd(false); setEditing(prog.id); setTempMiles(""); setTempTier(""); }}
                  className="w-full flex items-center gap-3 rounded-2xl border border-slate-700/60 bg-slate-800/30 px-4 py-3 text-left active:bg-slate-800 mb-1">
                  <span className="text-xl">{prog.emoji}</span>
                  <span>
                    <p className="text-sm font-semibold text-white">{prog.name}</p>
                    <p className="text-xs text-slate-500">{prog.cppEstimate}¢ per point baseline</p>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
