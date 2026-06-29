/** Shared Tailwind classes: large on phone/tablet, compact on lg+ desktop. */

export function flightCardTypography(simplifiedMobile = false) {
  const phone = simplifiedMobile ? "" : "lg:";
  return {
    section: simplifiedMobile
      ? "text-[17px] leading-snug"
      : "max-lg:text-[17px] max-lg:leading-snug",
    detailLabel: `${phone === "" ? "text-lg" : "text-lg lg:text-[10px]"} font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400`,
    detailValue: `${phone === "" ? "text-3xl" : "text-3xl lg:text-sm"} font-bold ${phone === "" ? "mt-1.5" : "mt-1 lg:mt-0.5"}`,
    actionBtn: `${phone === "" ? "py-4 text-[17px] min-h-[56px]" : "py-4 text-[17px] min-h-[56px] lg:py-2 lg:text-sm lg:min-h-0"} flex-1 rounded-2xl font-bold active:opacity-70 lg:rounded-xl lg:font-semibold`,
    airportCode: `${phone === "" ? "text-[3.25rem]" : "text-[3.25rem] lg:text-4xl"} font-black text-slate-900 dark:text-white tracking-tight leading-none`,
    timeText: `${phone === "" ? "text-xl" : "text-xl lg:text-base"} font-semibold text-slate-900 dark:text-white ${phone === "" ? "mt-2" : "mt-1.5 lg:mt-1"}`,
    dateText: `${phone === "" ? "text-lg" : "text-lg lg:text-sm"} font-bold text-slate-700 dark:text-slate-200 text-center leading-tight whitespace-nowrap`,
    heading: `${phone === "" ? "text-[1.75rem]" : "text-[1.75rem] lg:text-xl"} font-bold text-slate-900 dark:text-white tracking-tight`,
    subheading: `${phone === "" ? "text-[17px]" : "text-[17px] lg:text-sm"} text-slate-500 dark:text-slate-400 mt-0.5`,
    airline: `${phone === "" ? "text-base" : "text-base lg:text-xs"} font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider`,
    flightNum: `${phone === "" ? "text-sm" : "text-sm lg:text-[10px]"} rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-bold text-slate-600 dark:text-slate-300`,
    badge: `${phone === "" ? "text-xs" : "text-xs lg:text-[10px]"} font-bold`,
    detailsPad: `${phone === "" ? "py-4" : "py-4 lg:py-3"}`,
    routeMid: `${phone === "" ? "min-w-[6.5rem]" : "min-w-[6.5rem] lg:min-w-[5.75rem]"}`,
    addBtn: `${phone === "" ? "px-4 py-3 text-base min-h-[48px]" : "px-4 py-3 text-base min-h-[48px] lg:px-3 lg:py-2 lg:text-xs lg:min-h-0"}`,
    deleteBtn: `${phone === "" ? "px-4 py-3.5 text-base min-h-[52px] min-w-[52px]" : "px-4 py-3.5 text-base min-h-[52px] min-w-[52px] lg:px-3 lg:py-2 lg:text-sm lg:min-h-0 lg:min-w-0"} rounded-2xl bg-red-50 dark:bg-red-500/10 font-bold text-red-600 dark:text-red-400 active:opacity-70 lg:rounded-xl`,
  };
}

export function guideCardTypography(simplifiedMobile = false) {
  const phone = simplifiedMobile ? "" : "lg:";
  return {
    eyebrow: `${phone === "" ? "text-base" : "text-base lg:text-[10px]"} font-bold uppercase tracking-wide text-sky-300/70`,
    gateLabel: `${phone === "" ? "text-base" : "text-base lg:text-[9px]"} font-bold uppercase tracking-wide text-sky-200/70`,
    gateValue: `${phone === "" ? "text-4xl" : "text-4xl lg:text-xl"} font-black mt-1`,
    gatePad: `${phone === "" ? "p-5" : "p-5 lg:p-3"}`,
    refreshBtn: `${phone === "" ? "py-4 text-[17px]" : "py-4 text-[17px] lg:py-2.5 lg:text-xs"}`,
  };
}

export function hotelCardTypography(simplifiedMobile = false) {
  const phone = simplifiedMobile ? "" : "lg:";
  return {
    section: simplifiedMobile
      ? "text-[17px] leading-snug"
      : "max-lg:text-[17px] max-lg:leading-snug",
    heading: `${phone === "" ? "text-2xl" : "text-2xl lg:text-xl"} font-bold text-slate-900 dark:text-white tracking-tight`,
    subheading: `${phone === "" ? "text-base" : "text-base lg:text-sm"} text-slate-500 dark:text-slate-400 mt-0.5`,
    detailLabel: `${phone === "" ? "text-sm" : "text-sm lg:text-[10px]"} font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400`,
    detailValue: `${phone === "" ? "text-base" : "text-base lg:text-xs"} font-bold text-slate-900 dark:text-white`,
    title: `${phone === "" ? "text-lg" : "text-lg lg:text-base"} font-bold text-slate-900 dark:text-white leading-snug truncate`,
    location: `${phone === "" ? "text-base" : "text-base lg:text-sm"} text-slate-500 dark:text-slate-400 truncate mt-0.5`,
    actionBtn: `${phone === "" ? "py-3.5 text-base min-h-[52px]" : "py-3.5 text-base min-h-[52px] lg:py-2 lg:text-sm lg:min-h-0"} flex-1 rounded-2xl font-semibold active:opacity-70 lg:rounded-xl`,
    addBtn: `${phone === "" ? "px-4 py-3 text-base min-h-[48px]" : "px-4 py-3 text-base min-h-[48px] lg:px-3 lg:py-2 lg:text-xs lg:min-h-0"}`,
  };
}
