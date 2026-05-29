"use client";

import { useCallback, useEffect, useState } from "react";
import { generateId } from "@/lib/utils/generateId";

/* ─── Types ──────────────────────────────────────────────────── */
interface BagItem {
  id: string;
  label: string;
  checked: boolean;
  critical: boolean;
  weightKg?: number; // optional per-item weight
}

interface Bag {
  id: string;
  name: string;
  type: "carry-on" | "checked" | "personal";
  weightKg: number; // manual gross weight entry
  maxWeightKg: number;
  items: BagItem[];
  color: string;
}

interface BagControlState {
  bags: Bag[];
  updatedAt: string;
}

interface BagControlProps {
  tripId: string | null;
}

/* ─── Constants ──────────────────────────────────────────────── */
const CARRY_ON_LIMIT_KG = 10;
const CHECKED_LIMIT_KG = 23;
const PERSONAL_LIMIT_KG = 8;

const BAG_COLORS = ["#0ea5e9", "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const BAG_TYPE_LABEL: Record<Bag["type"], string> = {
  "carry-on": "Carry-on",
  checked: "Checked bag",
  personal: "Personal item",
};

const BAG_TYPE_ICON: Record<Bag["type"], string> = {
  "carry-on": "🧳",
  checked: "📦",
  personal: "👜",
};

const DEFAULT_MAX: Record<Bag["type"], number> = {
  "carry-on": CARRY_ON_LIMIT_KG,
  checked: CHECKED_LIMIT_KG,
  personal: PERSONAL_LIMIT_KG,
};

/* ─── Helpers ────────────────────────────────────────────────── */
function weightBar(kg: number, max: number): { pct: number; color: string } {
  const pct = Math.min((kg / max) * 100, 100);
  const color =
    pct >= 100
      ? "#ef4444"
      : pct >= 85
      ? "#f59e0b"
      : "#10b981";
  return { pct, color };
}

function fmtKg(n: number): string {
  return `${n % 1 === 0 ? n : n.toFixed(1)} kg`;
}

/* ─── Component ──────────────────────────────────────────────── */
export function BagControl({ tripId }: BagControlProps) {
  const [bags, setBags] = useState<Bag[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBag, setExpandedBag] = useState<string | null>(null);
  const [showAddBag, setShowAddBag] = useState(false);
  const [newBagName, setNewBagName] = useState("");
  const [newBagType, setNewBagType] = useState<Bag["type"]>("carry-on");
  const [newItemLabel, setNewItemLabel] = useState<Record<string, string>>({});

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/bags?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      if (r.ok) {
        const d = (await r.json()) as { state: BagControlState | null };
        if (d.state?.bags) setBags(d.state.bags);
        else setBags([]);
      }
    } catch {
      setError("Could not load bag data.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { void load(); }, [load]);

  /* ── Save (debounced via caller) ── */
  const save = useCallback(async (nextBags: Bag[]) => {
    if (!tripId) return;
    setSaving(true);
    try {
      await fetch("/api/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, bags: nextBags }),
      });
    } catch {
      // silent — state stays local
    } finally {
      setSaving(false);
    }
  }, [tripId]);

  const updateBags = useCallback((next: Bag[]) => {
    setBags(next);
    void save(next);
  }, [save]);

  /* ── Add bag ── */
  const addBag = useCallback(() => {
    if (!newBagName.trim()) return;
    const next: Bag = {
      id: generateId(),
      name: newBagName.trim(),
      type: newBagType,
      weightKg: 0,
      maxWeightKg: DEFAULT_MAX[newBagType],
      items: [],
      color: BAG_COLORS[bags.length % BAG_COLORS.length],
    };
    const nextBags = [...bags, next];
    updateBags(nextBags);
    setNewBagName("");
    setShowAddBag(false);
    setExpandedBag(next.id);
  }, [bags, newBagName, newBagType, updateBags]);

  /* ── Delete bag ── */
  const deleteBag = useCallback((bagId: string) => {
    updateBags(bags.filter(b => b.id !== bagId));
    if (expandedBag === bagId) setExpandedBag(null);
  }, [bags, expandedBag, updateBags]);

  /* ── Weight edit ── */
  const updateWeight = useCallback((bagId: string, val: string) => {
    const kg = parseFloat(val);
    const nextBags = bags.map(b =>
      b.id === bagId ? { ...b, weightKg: isNaN(kg) ? 0 : Math.max(0, kg) } : b
    );
    updateBags(nextBags);
  }, [bags, updateBags]);

  const updateMaxWeight = useCallback((bagId: string, val: string) => {
    const kg = parseFloat(val);
    const nextBags = bags.map(b =>
      b.id === bagId ? { ...b, maxWeightKg: isNaN(kg) ? DEFAULT_MAX[b.type] : Math.max(1, kg) } : b
    );
    updateBags(nextBags);
  }, [bags, updateBags]);

  /* ── Items ── */
  const addItem = useCallback((bagId: string) => {
    const label = (newItemLabel[bagId] ?? "").trim();
    if (!label) return;
    const nextBags = bags.map(b => {
      if (b.id !== bagId) return b;
      return {
        ...b,
        items: [
          ...b.items,
          { id: generateId(), label, checked: false, critical: false },
        ],
      };
    });
    updateBags(nextBags);
    setNewItemLabel(prev => ({ ...prev, [bagId]: "" }));
  }, [bags, newItemLabel, updateBags]);

  const toggleItem = useCallback((bagId: string, itemId: string) => {
    const nextBags = bags.map(b => {
      if (b.id !== bagId) return b;
      return {
        ...b,
        items: b.items.map(it =>
          it.id === itemId ? { ...it, checked: !it.checked } : it
        ),
      };
    });
    updateBags(nextBags);
  }, [bags, updateBags]);

  const toggleCritical = useCallback((bagId: string, itemId: string) => {
    const nextBags = bags.map(b => {
      if (b.id !== bagId) return b;
      return {
        ...b,
        items: b.items.map(it =>
          it.id === itemId ? { ...it, critical: !it.critical } : it
        ),
      };
    });
    updateBags(nextBags);
  }, [bags, updateBags]);

  const deleteItem = useCallback((bagId: string, itemId: string) => {
    const nextBags = bags.map(b => {
      if (b.id !== bagId) return b;
      return { ...b, items: b.items.filter(it => it.id !== itemId) };
    });
    updateBags(nextBags);
  }, [bags, updateBags]);

  /* ── Derived totals ── */
  const totalCarryOnKg = bags
    .filter(b => b.type === "carry-on" || b.type === "personal")
    .reduce((s, b) => s + b.weightKg, 0);
  const totalCheckedKg = bags
    .filter(b => b.type === "checked")
    .reduce((s, b) => s + b.weightKg, 0);
  const criticalUnchecked = bags.flatMap(b =>
    b.items.filter(it => it.critical && !it.checked).map(it => ({ bagName: b.name, label: it.label }))
  );
  const overweightBags = bags.filter(b => b.weightKg > b.maxWeightKg);

  /* ─── Render ─────────────────────────────────────────────── */
  if (!tripId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        No active trip. Select or create a trip to manage your bags.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Bag Control</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Weight tracking · carry-on checklist · critical items
          </p>
        </div>
        {saving && (
          <span className="text-[10px] text-sky-500 font-medium animate-pulse">Saving…</span>
        )}
      </div>

      {/* Alert: overweight */}
      {overweightBags.length > 0 && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-500/10">
          <p className="text-sm font-bold text-red-800 dark:text-red-300">⚠️ Overweight bag{overweightBags.length > 1 ? "s" : ""}</p>
          {overweightBags.map(b => (
            <p key={b.id} className="mt-0.5 text-xs text-red-700 dark:text-red-400">
              {BAG_TYPE_ICON[b.type]} {b.name}: {fmtKg(b.weightKg)} / {fmtKg(b.maxWeightKg)} — over by {fmtKg(b.weightKg - b.maxWeightKg)}
            </p>
          ))}
        </div>
      )}

      {/* Alert: critical unchecked */}
      {criticalUnchecked.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">🔴 Critical items not packed</p>
          {criticalUnchecked.slice(0, 4).map((it, i) => (
            <p key={i} className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              · {it.label} <span className="opacity-60">({it.bagName})</span>
            </p>
          ))}
          {criticalUnchecked.length > 4 && (
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
              +{criticalUnchecked.length - 4} more
            </p>
          )}
        </div>
      )}

      {/* Summary row */}
      {bags.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cabin total</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{fmtKg(totalCarryOnKg)}</p>
            <p className="text-[10px] text-slate-500">carry-on + personal</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Checked total</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{fmtKg(totalCheckedKg)}</p>
            <p className="text-[10px] text-slate-500">checked bags</p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {loading && bags.length === 0 && (
        <div className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      )}

      {/* Bag cards */}
      {bags.map(bag => {
        const { pct, color } = weightBar(bag.weightKg, bag.maxWeightKg);
        const isOpen = expandedBag === bag.id;
        const checkedCount = bag.items.filter(it => it.checked).length;
        const totalItems = bag.items.length;
        const critCount = bag.items.filter(it => it.critical && !it.checked).length;

        return (
          <div
            key={bag.id}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden"
          >
            {/* Bag header — tap to expand */}
            <button
              type="button"
              onClick={() => setExpandedBag(isOpen ? null : bag.id)}
              className="w-full flex items-center gap-3 p-4 text-left"
            >
              {/* Color dot */}
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ background: bag.color }}
              />
              <span className="text-lg shrink-0">{BAG_TYPE_ICON[bag.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{bag.name}</p>
                  <span className="text-[10px] rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-500 dark:text-slate-400">
                    {BAG_TYPE_LABEL[bag.type]}
                  </span>
                </div>
                {/* Weight bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold shrink-0" style={{ color }}>
                    {fmtKg(bag.weightKg)} / {fmtKg(bag.maxWeightKg)}
                  </span>
                </div>
              </div>
              {/* Badges */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                {critCount > 0 && (
                  <span className="rounded-full bg-red-100 dark:bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                    🔴 {critCount}
                  </span>
                )}
                {totalItems > 0 && (
                  <span className="text-[10px] text-slate-400">{checkedCount}/{totalItems}</span>
                )}
                <span className="text-slate-400 text-xs">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* Expanded content */}
            {isOpen && (
              <div className="border-t border-slate-100 dark:border-slate-800 px-4 pb-4 space-y-4">
                {/* Weight inputs */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={bag.weightKg || ""}
                      onChange={e => updateWeight(bag.id, e.target.value)}
                      placeholder="0.0"
                      className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Limit (kg)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      value={bag.maxWeightKg || ""}
                      onChange={e => updateMaxWeight(bag.id, e.target.value)}
                      placeholder={String(DEFAULT_MAX[bag.type])}
                      className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                </div>

                {/* Items list */}
                {bag.items.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Checklist — {checkedCount}/{totalItems} packed
                    </p>
                    <div className="space-y-1">
                      {bag.items.map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                            item.checked
                              ? "bg-emerald-50 dark:bg-emerald-500/10"
                              : item.critical
                              ? "bg-red-50 dark:bg-red-500/10"
                              : "bg-slate-50 dark:bg-slate-800"
                          }`}
                        >
                          {/* Checked toggle */}
                          <button
                            type="button"
                            onClick={() => toggleItem(bag.id, item.id)}
                            className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                              item.checked
                                ? "border-emerald-500 bg-emerald-500"
                                : "border-slate-300 dark:border-slate-600"
                            }`}
                          >
                            {item.checked && <span className="text-white text-[10px] font-bold">✓</span>}
                          </button>
                          {/* Label */}
                          <span className={`flex-1 text-sm ${
                            item.checked
                              ? "line-through text-slate-400 dark:text-slate-500"
                              : "text-slate-900 dark:text-slate-100"
                          }`}>
                            {item.label}
                          </span>
                          {/* Critical toggle */}
                          <button
                            type="button"
                            onClick={() => toggleCritical(bag.id, item.id)}
                            title={item.critical ? "Remove critical flag" : "Mark as critical"}
                            className={`text-xs px-1.5 py-0.5 rounded-lg transition-all ${
                              item.critical
                                ? "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                                : "text-slate-300 dark:text-slate-600 hover:text-red-400"
                            }`}
                          >
                            🔴
                          </button>
                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => deleteItem(bag.id, item.id)}
                            className="text-slate-300 dark:text-slate-600 hover:text-red-400 text-sm px-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add item input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItemLabel[bag.id] ?? ""}
                    onChange={e => setNewItemLabel(prev => ({ ...prev, [bag.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(bag.id); } }}
                    placeholder="Add item (e.g. passport, charger)…"
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => addItem(bag.id)}
                    className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-700"
                  >
                    +
                  </button>
                </div>

                {/* Delete bag */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove "${bag.name}"?`)) deleteBag(bag.id);
                  }}
                  className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 transition"
                >
                  Remove this bag
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {!loading && bags.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center">
          <p className="text-3xl mb-2">🧳</p>
          <p className="font-semibold text-slate-700 dark:text-slate-300">No bags yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Add your carry-on, checked bag, or personal item to track weight and packing.
          </p>
        </div>
      )}

      {/* Add bag form */}
      {showAddBag ? (
        <div className="rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 p-4 space-y-3">
          <p className="font-semibold text-sky-800 dark:text-sky-200 text-sm">New bag</p>
          <input
            type="text"
            value={newBagName}
            onChange={e => setNewBagName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addBag(); } }}
            placeholder="Bag name (e.g. Blue Tumi carry-on)"
            className="w-full rounded-xl border border-sky-200 dark:border-sky-500/30 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <div className="grid grid-cols-3 gap-2">
            {(["carry-on", "checked", "personal"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setNewBagType(t)}
                className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
                  newBagType === t
                    ? "bg-sky-600 text-white"
                    : "bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300"
                }`}
              >
                {BAG_TYPE_ICON[t]} {BAG_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addBag}
              disabled={!newBagName.trim()}
              className="flex-1 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-40"
            >
              Add bag
            </button>
            <button
              type="button"
              onClick={() => setShowAddBag(false)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddBag(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400 transition hover:border-sky-400 hover:text-sky-600 dark:hover:border-sky-500 dark:hover:text-sky-400"
        >
          + Add bag
        </button>
      )}
    </div>
  );
}
