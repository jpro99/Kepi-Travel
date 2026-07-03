"use client";

import { useState, useEffect } from "react";
import { groupByCategory, CATEGORY_EMOJI, type PackingItem } from "@/lib/packing/smartPack";

interface SmartPackingListProps {
  destination: string;
  departDate: string;
  returnDate?: string;
  tripType?: "business" | "leisure" | "mixed" | "beach" | "ski" | "adventure";
  nights?: number;
}

export function SmartPackingList({ destination, departDate, returnDate, tripType = "leisure", nights }: SmartPackingListProps) {
  const [items, setItems] = useState<PackingItem[]>([]);
  const [aiAdditions, setAiAdditions] = useState<{ name: string; category: string; note: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showEssentialOnly, setShowEssentialOnly] = useState(false);

  useEffect(() => {
    if (!destination || !departDate) return;
    setLoading(true);
    fetch("/api/packing/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, departDate, returnDate, tripType, nights }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.items) setItems(d.items);
        if (d.aiAdditions) setAiAdditions(d.aiAdditions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [destination, departDate, returnDate, tripType, nights]);

  const togglePacked = (id: string) => {
    setPacked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1,2,3].map(i => (
          <div key={i} className="h-12 rounded-2xl bg-slate-800" />
        ))}
        <p className="text-xs text-center text-slate-500">Building your packing list…</p>
      </div>
    );
  }

  const allItems = [
    ...items,
    ...aiAdditions.map((a, i) => ({
      id: `ai_${i}`,
      name: a.name,
      category: a.category,
      quantity: 1,
      essential: false,
      packed: false,
      note: `✨ ${a.note}`,
    }))
  ];

  const displayItems = showEssentialOnly ? allItems.filter(i => i.essential) : allItems;
  const grouped = groupByCategory(displayItems);
  const totalItems = allItems.length;
  const packedCount = allItems.filter(i => packed.has(i.id)).length;
  const progress = totalItems > 0 ? (packedCount / totalItems) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1a2f4a] to-[#0f1e35] border border-slate-700 px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{destination}</p>
            <p className="text-lg font-black text-white">{packedCount} / {totalItems} packed</p>
          </div>
          <div className="text-right">
            {progress === 100 && <p className="text-2xl">✅</p>}
            {progress > 0 && progress < 100 && <p className="text-sm font-bold text-[#f4c95d]">{Math.round(progress)}%</p>}
          </div>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#f4c95d] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Essential only toggle */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowEssentialOnly(!showEssentialOnly)}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${showEssentialOnly ? "bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]" : "border-slate-600 text-slate-400"}`}
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => setPacked(new Set())}
          className="text-xs text-slate-500"
        >
          Reset all
        </button>
      </div>

      {/* Categories */}
      {[...grouped.entries()].map(([category, catItems]) => {
        const isCollapsed = collapsed.has(category);
        const catPacked = catItems.filter(i => packed.has(i.id)).length;
        const allPacked = catPacked === catItems.length;
        const emoji = CATEGORY_EMOJI[category] ?? "📦";

        return (
          <div key={category} className="rounded-2xl border border-slate-700 bg-[#111e33] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCollapse(category)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span className="text-lg">{emoji}</span>
              <span className="flex-1">
                <span className="text-sm font-bold text-white">{category}</span>
                <span className="text-xs text-slate-500 ml-2">{catPacked}/{catItems.length}</span>
              </span>
              {allPacked && <span className="text-emerald-400 text-xs font-bold">✓</span>}
              <span className="text-slate-500 text-xs">{isCollapsed ? "▼" : "▲"}</span>
            </button>

            {!isCollapsed && (
              <div className="border-t border-slate-700/50">
                {catItems.map(item => {
                  const isPacked = packed.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => togglePacked(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-700/30 last:border-0 active:bg-slate-800/50 transition ${isPacked ? "opacity-50" : ""}`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition ${isPacked ? "bg-emerald-500 border-emerald-500" : item.essential ? "border-[#f4c95d]" : "border-slate-600"}`}>
                        {isPacked && <span className="text-white text-xs">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${isPacked ? "line-through text-slate-500" : "text-white"}`}>
                          {item.name}
                          {item.quantity > 1 && <span className="text-slate-400 ml-1">×{item.quantity}{item.unit ? ` ${item.unit}` : ""}</span>}
                          {item.essential && !isPacked && <span className="ml-1.5 text-[9px] font-black text-[#f4c95d] uppercase">Essential</span>}
                        </p>
                        {item.note && <p className="text-[10px] text-slate-500 mt-0.5">{item.note}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {aiAdditions.length > 0 && (
        <p className="text-[10px] text-slate-600 text-center">
          ✨ {aiAdditions.length} destination-specific items added by AI
        </p>
      )}
    </div>
  );
}
