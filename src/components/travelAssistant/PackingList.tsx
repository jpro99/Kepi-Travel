"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PackingCategory = "essentials" | "clothing" | "toiletries" | "electronics" | "documents" | "optional";

interface PackingItem {
  id: string;
  label: string;
  checked: boolean;
  category: PackingCategory;
  custom?: boolean;
}

interface PackingListState {
  tripId: string;
  updatedAt: string;
  generatedAt: string | null;
  categories: Record<PackingCategory, PackingItem[]>;
}

interface PackingResponse {
  tripId: string;
  list: PackingListState | null;
  completionPercent: number;
}

interface PackingListProps {
  tripId: string | null;
  onCompletionChange?: (percent: number) => void;
}

const CATEGORIES: PackingCategory[] = [
  "essentials",
  "clothing",
  "toiletries",
  "electronics",
  "documents",
  "optional",
];

const CATEGORY_LABEL: Record<PackingCategory, string> = {
  essentials: "Essentials",
  clothing: "Clothing",
  toiletries: "Toiletries",
  electronics: "Electronics",
  documents: "Documents",
  optional: "Optional",
};

function sortedByChecked(items: PackingItem[]): PackingItem[] {
  return [...items].sort((left, right) => Number(left.checked) - Number(right.checked));
}

export function PackingList({ tripId, onCompletionChange }: PackingListProps) {
  const [list, setList] = useState<PackingListState | null>(null);
  const [completionPercent, setCompletionPercent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customItemText, setCustomItemText] = useState("");
  const [customItemCategory, setCustomItemCategory] = useState<PackingCategory>("optional");
  const touchStartByItemRef = useRef<Record<string, number>>({});
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const applyPayload = useCallback(
    (payload: PackingResponse): void => {
      setList(payload.list);
      setCompletionPercent(payload.completionPercent);
      onCompletionChange?.(payload.completionPercent);
    },
    [onCompletionChange],
  );

  const loadPackingList = useCallback(async (): Promise<void> => {
    if (!tripId) {
      applyPayload({ tripId: "", list: null, completionPercent: 0 });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/travel-updates/packing?tripId=${encodeURIComponent(tripId)}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 404) {
          applyPayload({ tripId, list: null, completionPercent: 0 });
          return;
        }
        throw new Error(`Packing API returned ${response.status}`);
      }
      const payload = (await response.json()) as PackingResponse;
      applyPayload(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load packing list.");
      applyPayload({ tripId, list: null, completionPercent: 0 });
    } finally {
      setLoading(false);
    }
  }, [applyPayload, tripId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPackingList();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadPackingList]);

  const regenerateWithAI = async (): Promise<void> => {
    if (!tripId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/travel-updates/packing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, forceRefresh: true }),
      });
      if (!response.ok) {
        throw new Error(`Packing generation failed (${response.status})`);
      }
      const payload = (await response.json()) as PackingResponse;
      applyPayload(payload);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Unable to generate packing list.");
    } finally {
      setBusy(false);
    }
  };

  const patchPacking = useCallback(
    async (body: Record<string, unknown>): Promise<void> => {
      if (!tripId) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/travel-updates/packing", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, ...body }),
        });
        if (!response.ok) {
          throw new Error(`Packing update failed (${response.status})`);
        }
        const payload = (await response.json()) as PackingResponse;
        applyPayload(payload);
      } catch (patchError) {
        setError(patchError instanceof Error ? patchError.message : "Packing update failed.");
      } finally {
        setBusy(false);
      }
    },
    [applyPayload, tripId],
  );

  const addCustomItem = async (): Promise<void> => {
    const label = customItemText.trim();
    if (!label) return;
    await patchPacking({
      action: "add-custom",
      label,
      category: customItemCategory,
    });
    setCustomItemText("");
  };

  const handleSharePackingList = async (): Promise<void> => {
    if (!tripId || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setShareMessage(null);
    try {
      const response = await fetch("/api/trips/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          options: {
            expiresInDays: 7,
            readOnly: true,
            showPersonalNotes: false,
          },
        }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? `Share failed (${response.status})`);
      }
      await navigator.clipboard.writeText(payload.url);
      setShareMessage("Packing list share link copied.");
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Unable to share packing list.");
    } finally {
      setBusy(false);
    }
  };

  const totalItems = useMemo(
    () => (list ? CATEGORIES.reduce((count, category) => count + list.categories[category].length, 0) : 0),
    [list],
  );
  const packedItems = useMemo(
    () =>
      list
        ? CATEGORIES.reduce(
            (count, category) => count + list.categories[category].filter((item) => item.checked).length,
            0,
          )
        : 0,
    [list],
  );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Smart packing list</h2>
          <p className="text-xs text-slate-400">AI-generated list that adapts to destination, weather, and trip profile.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void regenerateWithAI();
            }}
            disabled={!tripId || busy}
            className="rounded-lg bg-cyan-500/90 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            Regenerate with AI
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSharePackingList();
            }}
            disabled={!tripId || busy}
            className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold ring-1 ring-slate-700 hover:bg-slate-700 disabled:opacity-60"
          >
            Share packing list
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>
            {packedItems} of {totalItems} items packed
          </span>
          <span>{completionPercent}%</span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-slate-800">
          <div
            className="h-2 rounded-full bg-emerald-400 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, completionPercent))}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          value={customItemText}
          onChange={(event) => setCustomItemText(event.target.value)}
          placeholder="Add custom packing item..."
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <select
            value={customItemCategory}
            onChange={(event) => setCustomItemCategory(event.target.value as PackingCategory)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs"
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              void addCustomItem();
            }}
            disabled={busy || !customItemText.trim()}
            className="rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            Add
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-2 md:grid-cols-2" aria-label="Packing list loading">
          <div className="h-20 rounded-xl border border-slate-700 bg-slate-950/60" />
          <div className="h-20 rounded-xl border border-slate-700 bg-slate-950/60" />
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {shareMessage ? <p className="text-xs text-emerald-300">{shareMessage}</p> : null}

      {!loading && !list ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-300">
          <p>No packing list generated yet for this trip.</p>
          <button
            type="button"
            onClick={() => {
              void regenerateWithAI();
            }}
            disabled={!tripId || busy}
            className="mt-3 rounded-lg bg-cyan-500/90 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            Generate smart packing list
          </button>
        </div>
      ) : null}

      {list
        ? CATEGORIES.map((category) => {
            const items = sortedByChecked(list.categories[category] ?? []);
            if (items.length === 0) {
              return null;
            }
            return (
              <article key={category} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <h3 className="text-sm font-semibold text-slate-100">{CATEGORY_LABEL[category]}</h3>
                <ul className="mt-2 space-y-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      onTouchStart={(event) => {
                        touchStartByItemRef.current[item.id] = event.changedTouches[0]?.clientX ?? 0;
                      }}
                      onTouchEnd={(event) => {
                        const startX = touchStartByItemRef.current[item.id];
                        const endX = event.changedTouches[0]?.clientX ?? 0;
                        if (startX - endX > 70) {
                          void patchPacking({
                            action: "remove",
                            itemId: item.id,
                          });
                        }
                      }}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => {
                            void patchPacking({
                              action: "toggle",
                              itemId: item.id,
                            });
                          }}
                        />
                        <span
                          className={`flex-1 text-sm ${
                            item.checked ? "text-slate-500 line-through" : "text-slate-100"
                          }`}
                        >
                          {item.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void patchPacking({
                              action: "remove",
                              itemId: item.id,
                            });
                          }}
                          className="rounded bg-slate-800 px-2 py-1 text-[10px] ring-1 ring-slate-700 hover:bg-slate-700"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })
        : null}
    </section>
  );
}
