import type { TransitKind, TransitStop } from "@/lib/hotels/nearbyTransit";

export function transitMarkerStyle(kind: TransitKind): { label: string; bg: string } {
  if (kind === "train") return { label: "T", bg: "#0c4a6e" };
  if (kind === "tram") return { label: "♦", bg: "#0369a1" };
  if (kind === "bus") return { label: "B", bg: "#475569" };
  return { label: "M", bg: "#0284c7" };
}

export function createTransitMarker(stop: TransitStop, options?: { showLabel?: boolean }): HTMLButtonElement {
  const style = transitMarkerStyle(stop.kind);
  const showLabel = options?.showLabel ?? false;
  const wrap = document.createElement("button");
  wrap.type = "button";
  wrap.title = stop.name;
  wrap.className = "group flex flex-col items-center border-0 bg-transparent p-0";
  wrap.style.zIndex = "15";

  const badge = document.createElement("span");
  badge.className =
    "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-white shadow-md ring-2 ring-white";
  badge.style.backgroundColor = style.bg;
  badge.textContent = style.label;

  const label = document.createElement("span");
  label.className = showLabel
    ? "mt-0.5 max-w-[7rem] truncate rounded bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-semibold text-white"
    : "mt-0.5 max-w-[7rem] truncate rounded bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-semibold text-white opacity-0 group-hover:opacity-100";
  label.textContent = stop.name;

  wrap.append(badge, label);
  return wrap;
}
