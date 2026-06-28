"use client";

import type { AirlineChainId, HotelChainId } from "@/lib/loyalty/chainRegistry";
import { AIRLINE_CHAINS, HOTEL_CHAINS } from "@/lib/loyalty/chainRegistry";

interface ChainFilterBarProps<T extends string> {
  kind: "hotel" | "airline";
  toggles: Record<T, boolean>;
  onChange: (id: T, enabled: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function HotelChainFilterBar({
  toggles,
  onChange,
  collapsed,
  onToggleCollapse,
}: {
  toggles: Record<HotelChainId, boolean>;
  onChange: (id: HotelChainId, enabled: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <ChainFilterBarInner
      kind="hotel"
      chains={HOTEL_CHAINS}
      toggles={toggles}
      onChange={onChange}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
}

export function AirlineChainFilterBar({
  toggles,
  onChange,
  collapsed,
  onToggleCollapse,
}: {
  toggles: Record<AirlineChainId, boolean>;
  onChange: (id: AirlineChainId, enabled: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <ChainFilterBarInner
      kind="airline"
      chains={AIRLINE_CHAINS}
      toggles={toggles}
      onChange={onChange}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
}

function ChainFilterBarInner<T extends string>({
  kind,
  chains,
  toggles,
  onChange,
  collapsed,
  onToggleCollapse,
}: {
  kind: "hotel" | "airline";
  chains: Array<{ id: T; label: string; programName: string }>;
  toggles: Record<T, boolean>;
  onChange: (id: T, enabled: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const enabledCount = chains.filter((chain) => toggles[chain.id] !== false).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {kind === "hotel" ? "Hotel chains" : "Airlines"} · {enabledCount} selected
        </p>
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-[10px] font-semibold text-sky-700 dark:text-sky-300"
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chains.map((chain) => {
            const enabled = toggles[chain.id] !== false;
            return (
              <label
                key={chain.id}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
                  enabled
                    ? "border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-100"
                    : "border-slate-300 bg-white text-slate-400 line-through dark:border-slate-600 dark:bg-slate-900"
                }`}
                title={chain.programName}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => onChange(chain.id, event.target.checked)}
                  className="h-3 w-3 rounded border-slate-300"
                />
                {chain.label}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
