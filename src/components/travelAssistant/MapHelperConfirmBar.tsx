"use client";

import { useCallback, useMemo, useState } from "react";
import type { AirportLayout } from "@/lib/airportNav/types";
import {
  buildMapHelperNearbyChips,
  type MapHelperChip,
} from "@/lib/airportNav/mapHelperNearby";

interface MapHelperConfirmBarProps {
  iata: string;
  layout: AirportLayout;
  /** Helper position [lng, lat] — confirmed node or GPS. */
  pos: [number, number] | null;
  accuracyM?: number | null;
  bottomOffset: string;
}

/**
 * Apple-simple one-tap confirms for map helpers: big Door / Starbucks chips.
 * No typing. Reports go to admin inbox; never auto-publish.
 */
export function MapHelperConfirmBar({
  iata,
  layout,
  pos,
  accuracyM,
  bottomOffset,
}: MapHelperConfirmBarProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => new Set());

  const chips = useMemo(
    () => buildMapHelperNearbyChips(layout, pos, { maxChips: 5 }),
    [layout, pos],
  );

  const submit = useCallback(
    async (chip: MapHelperChip) => {
      if (!pos || busyId) return;
      setBusyId(chip.id);
      setToast(null);
      try {
        const res = await fetch("/api/map-helper/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: chip.kind,
            iata,
            poiId: chip.poiId,
            poiName: chip.poiName,
            poiCategory: chip.poiCategory,
            doorLabel: chip.doorLabel,
            nodeId: chip.nodeId,
            pos,
            accuracyM: accuracyM ?? null,
            layoutVersion: layout.layoutVersion,
          }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `Save failed (${res.status})`);
        }
        setConfirmedIds((prev) => new Set(prev).add(chip.id));
        setToast(`Got it — ${chip.label}`);
        window.setTimeout(() => setToast(null), 2200);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Couldn’t save");
        window.setTimeout(() => setToast(null), 2800);
      } finally {
        setBusyId(null);
      }
    },
    [accuracyM, busyId, iata, layout.layoutVersion, pos],
  );

  if (!pos || chips.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-40 px-3"
      style={{ bottom: bottomOffset }}
      data-testid="map-helper-confirm-bar"
    >
      <div className="pointer-events-auto mx-auto max-w-lg rounded-[28px] border border-white/20 bg-[#0b1f3a]/92 px-3 py-3 shadow-2xl backdrop-blur-xl">
        <p className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200/90">
          Help improve the map
        </p>
        <p className="mt-0.5 px-1 text-[15px] font-semibold leading-snug text-white">
          Is this the gate? Is Alaska here? Tap yes — one button is enough
        </p>
        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
          {chips.map((chip) => {
            const done = confirmedIds.has(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                disabled={Boolean(busyId) || done}
                onClick={() => {
                  void submit(chip);
                }}
                className={`min-h-[52px] shrink-0 rounded-2xl px-4 text-[16px] font-bold transition ${
                  done
                    ? "bg-emerald-500/90 text-white"
                    : chip.kind === "confirm_door"
                      ? "bg-white text-[#0b1f3a]"
                      : "bg-sky-500 text-white"
                } disabled:opacity-70`}
              >
                {busyId === chip.id ? "…" : done ? `✓ ${chip.label}` : chip.label}
              </button>
            );
          })}
        </div>
        {toast ? (
          <p className="mt-2 px-1 text-[13px] font-medium text-emerald-200">{toast}</p>
        ) : (
          <p className="mt-2 px-1 text-[12px] leading-snug text-white/55">
            Just for helpers (Admin → Turn on for me only). Confirms never auto-publish.
          </p>
        )}
      </div>
    </div>
  );
}
