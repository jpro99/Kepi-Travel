"use client";

import type { Ref } from "react";

export interface TripReadinessChecklistItem {
  id: string;
  title: string;
  complete: boolean;
  required: boolean;
  category?: string;
}

interface TripReadinessChecklistSectionProps {
  items: TripReadinessChecklistItem[];
  unresolvedCount: number;
  onToggle: (id: string) => void;
  sectionRef?: Ref<HTMLElement>;
  id?: string;
  title?: string;
  pendingLabel?: string;
}

export function TripReadinessChecklistSection({
  items,
  unresolvedCount,
  onToggle,
  sectionRef,
  id = "readiness-checklist-section",
  title = "Trip readiness",
  pendingLabel,
}: TripReadinessChecklistSectionProps) {
  const pendingText =
    pendingLabel ??
    `${unresolvedCount} item${unresolvedCount === 1 ? "" : "s"} left`;

  return (
    <section
      id={id}
      ref={sectionRef}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {unresolvedCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
            {pendingText}
          </span>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            role="checkbox"
            aria-checked={item.complete}
            tabIndex={0}
            onClick={() => onToggle(item.id)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onToggle(item.id);
              }
            }}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
              item.complete
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60"
            }`}
          >
            <div
              className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                item.complete ? "border-emerald-500 bg-emerald-500" : "border-slate-400"
              }`}
            >
              {item.complete ? <span className="text-[10px] font-bold text-white">✓</span> : null}
            </div>
            <span className="flex-1">
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {item.category ?? "Readiness"} {item.required ? "• Required" : "• Optional"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
