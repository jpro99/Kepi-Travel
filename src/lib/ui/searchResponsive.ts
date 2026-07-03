/** Shared responsive layout for flight/hotel search — compact on phones, roomy on desktop. */

/** Page-level search shell (/book, results). */
export const SEARCH_PAGE_SHELL =
  "mx-auto w-full max-w-lg px-4 py-5 sm:px-6 md:max-w-2xl md:py-6 lg:max-w-4xl lg:py-8 xl:max-w-5xl";

/** Checkout / detail steps — slightly narrower than results. */
export const SEARCH_DETAIL_SHELL =
  "mx-auto w-full max-w-lg space-y-4 px-4 py-5 sm:px-6 md:max-w-2xl lg:max-w-3xl";

/** Results list shell. */
export const SEARCH_RESULTS_SHELL =
  "mx-auto w-full max-w-lg px-4 py-4 sm:px-6 md:max-w-2xl lg:max-w-4xl xl:max-w-5xl";

/** Modal shell for in-trip hotel search. */
export const SEARCH_MODAL_PANEL =
  "flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl";

/** Two-column results on wide screens. */
export const SEARCH_RESULTS_GRID = "space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:gap-5";

export const SEARCH_LABEL =
  "mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500 sm:text-xs md:mb-2";

export const SEARCH_LABEL_DARK =
  "mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500 sm:text-xs md:mb-2";

export const SEARCH_INPUT_LIGHT =
  "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none ring-sky-300 focus-visible:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:text-white md:px-5 md:py-4 md:text-lg";

export const SEARCH_INPUT_DARK =
  "w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-base text-white placeholder:text-slate-500 focus:border-[#f4c95d]/60 focus:outline-none md:px-5 md:py-4 md:text-lg";

export const SEARCH_SELECT_DARK =
  "w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-base text-white focus:outline-none md:px-5 md:py-4 md:text-lg";

export const SEARCH_PRIMARY_BUTTON =
  "w-full rounded-2xl py-4 text-base font-black active:opacity-80 md:py-5 md:text-lg";

export const SEARCH_TAB_BUTTON =
  "flex-1 rounded-xl py-3 text-sm font-bold transition md:py-3.5 md:text-base";
