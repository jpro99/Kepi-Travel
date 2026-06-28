"use client";

import type { TripActionItem } from "@/lib/travelAssistant/tripActionItems";

interface TripActionListProps {
  items: TripActionItem[];
  onAction: (item: TripActionItem) => void;
  compact?: boolean;
}

export function TripActionList({ items, onAction, compact = false }: TripActionListProps) {
  if (items.length === 0) return null;

  return (
    <div
      data-testid="trip-action-list"
      className={compact ? "mt-3 space-y-2" : "mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"}
    >
      {!compact ? (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-800/80 dark:text-amber-200/80">
          To do · {items.length}
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-testid={`trip-action-${item.kind}-${item.id}`}
              onClick={() => onAction(item)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-black/5 bg-white/90 px-3 py-2.5 text-left shadow-sm transition hover:bg-white dark:border-white/10 dark:bg-slate-900/80 dark:hover:bg-slate-900"
            >
              <span className="text-base leading-none" aria-hidden>
                {item.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.label}
                </span>
                {item.detail ? (
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {item.detail}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs font-bold text-sky-700 dark:text-sky-300">Fix →</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
