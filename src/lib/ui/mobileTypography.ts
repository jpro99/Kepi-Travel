/** Shared Tailwind classes: Apple HIG typography + controls. */

import {
  appleBtnDestructive,
  appleBtnPrimary,
  appleBtnSecondary,
  appleCard,
  appleCardTitle,
  appleCaption,
  appleLabel,
  appleMetadata,
} from "@/lib/ui/appleDesign";

export function flightCardTypography(simplifiedMobile = false) {
  const phone = simplifiedMobile ? "" : "lg:";
  return {
    section: simplifiedMobile
      ? "text-[17px] leading-snug"
      : "max-lg:text-[17px] max-lg:leading-snug",
    detailLabel: appleLabel,
    detailValue: `${phone === "" ? "text-[17px]" : "text-[17px] lg:text-sm"} font-semibold text-[var(--text-primary)]`,
    actionBtn: `${phone === "" ? "py-3 text-[17px] min-h-[44px]" : "py-3 text-[17px] min-h-[44px] lg:py-2 lg:text-sm lg:min-h-0"} flex-1 rounded-[var(--radius-button)] font-semibold transition-opacity duration-[220ms] ease-in-out active:opacity-70`,
    airportCode: `${phone === "" ? "text-[3.25rem]" : "text-[3.25rem] lg:text-4xl"} font-semibold text-[var(--text-primary)] tracking-tight leading-none`,
    timeText: `${phone === "" ? "text-[17px]" : "text-[17px] lg:text-base"} font-normal text-[var(--text-primary)]`,
    dateText: appleMetadata,
    heading: `apple-section-header ${phone === "" ? "" : "lg:text-xl"}`,
    subheading: appleMetadata,
    airline: appleCaption,
    flightNum: `${appleCaption} rounded-md bg-[var(--bg-grouped)] px-2 py-0.5 font-medium text-[var(--text-secondary)]`,
    badge: "text-[13px] font-medium",
    detailsPad: `${phone === "" ? "py-3" : "py-3 lg:py-2"}`,
    routeMid: `${phone === "" ? "min-w-[6.5rem]" : "min-w-[6.5rem] lg:min-w-[5.75rem]"}`,
    addBtn: `${phone === "" ? "px-4 py-2.5 text-[15px] min-h-[44px]" : "px-4 py-2.5 text-[15px] min-h-[44px] lg:px-3 lg:py-2 lg:text-xs lg:min-h-0"} ${appleBtnSecondary}`,
    deleteBtn: `${phone === "" ? "px-4 py-3 text-[17px] min-h-[44px]" : "px-4 py-3 text-[17px] min-h-[44px] lg:px-3 lg:py-2 lg:text-sm lg:min-h-0"} ${appleBtnDestructive}`,
    primaryBtn: appleBtnPrimary,
    secondaryBtn: appleBtnSecondary,
    card: appleCard,
    cardTitle: appleCardTitle,
  };
}

export function guideCardTypography(simplifiedMobile = false) {
  const phone = simplifiedMobile ? "" : "lg:";
  return {
    eyebrow: appleCaption,
    gateLabel: appleLabel,
    gateValue: `${phone === "" ? "text-[34px]" : "text-[34px] lg:text-xl"} font-semibold text-[var(--text-primary)]`,
    gatePad: `${phone === "" ? "p-4" : "p-4 lg:p-3"}`,
    refreshBtn: `${phone === "" ? "py-3 text-[17px]" : "py-3 text-[17px] lg:py-2.5 lg:text-xs"} font-semibold text-[var(--accent)]`,
    shell: `${appleCard} overflow-hidden`,
    title: "text-[var(--text-primary)]",
    subtitle: "text-[var(--text-secondary)]",
    gateBox: "rounded-[var(--radius-button)] bg-[var(--bg-grouped)] text-center",
    panel: "rounded-[var(--radius-card)] bg-[var(--bg-grouped)] overflow-hidden",
    panelHeader: appleLabel,
    bodyText: "text-[17px] text-[var(--text-primary)]",
    mutedText: "text-[var(--text-secondary)]",
  };
}

export function hotelCardTypography(simplifiedMobile = false) {
  const phone = simplifiedMobile ? "" : "lg:";
  return {
    section: simplifiedMobile
      ? "text-[17px] leading-snug"
      : "max-lg:text-[17px] max-lg:leading-snug",
    heading: `apple-section-header ${phone === "" ? "" : "lg:text-xl"}`,
    subheading: appleMetadata,
    detailLabel: appleLabel,
    detailValue: `${phone === "" ? "text-[17px]" : "text-[17px] lg:text-sm"} font-semibold text-[var(--text-primary)]`,
    title: appleCardTitle,
    location: `${appleMetadata} truncate mt-0.5`,
    actionBtn: `${phone === "" ? "py-3 text-[17px] min-h-[44px]" : "py-3 text-[17px] min-h-[44px] lg:py-2 lg:text-sm lg:min-h-0"} flex-1 rounded-[var(--radius-button)] font-semibold transition-opacity duration-[220ms] ease-in-out active:opacity-70`,
    addBtn: `${phone === "" ? "px-4 py-2.5 text-[15px] min-h-[44px]" : "px-4 py-2.5 text-[15px] min-h-[44px] lg:px-3 lg:py-2 lg:text-xs lg:min-h-0"} ${appleBtnSecondary}`,
    primaryBtn: appleBtnPrimary,
    secondaryBtn: appleBtnSecondary,
    destructiveBtn: appleBtnDestructive,
    card: appleCard,
    metadata: appleMetadata,
  };
}
