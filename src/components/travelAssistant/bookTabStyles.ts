/** Shared Book tab chrome — Flights and Hotels use the same card shell. */
export const BOOK_LIST_CARD_CLASS =
  "overflow-hidden rounded-3xl bg-[var(--bg-card)] shadow-sm ring-1 transition-all";

export const BOOK_SUBTAB_TOGGLE_CLASS =
  "flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-900";

export function bookSubTabButtonClass(active: boolean): string {
  return `flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
    active
      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
      : "text-slate-500 dark:text-slate-400"
  }`;
}

export const BOOK_ICON_TILE_CLASS =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-grouped)] text-2xl shadow-sm";
