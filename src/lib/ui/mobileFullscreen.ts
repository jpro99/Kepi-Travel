import type { CSSProperties } from "react";

/** Mobile overlay typography — large, readable, Apple-style. */

export const MOBILE_SHELL_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

/** Height of one ruled notebook line (px). Large enough to read without zooming. */
export const MOBILE_LINE_HEIGHT_PX = 64;

/** Body text on ruled lines. */
export const MOBILE_NOTEBOOK_FONT_PX = 26;

/** Line numbers in the left margin. */
export const MOBILE_NOTEBOOK_NUM_FONT_PX = 20;

/** Minimum ruled lines so the page always scrolls on phone. */
export const MOBILE_MIN_NOTEBOOK_LINES = 24;

export const MOBILE_NOTEBOOK = {
  paper: "#faf6ee",
  rule: "rgba(168, 158, 140, 0.55)",
  margin: "rgba(220, 80, 70, 0.35)",
  marginWidthPx: 64,
} as const;

export function notebookRuleGradient(lineHeightPx = MOBILE_LINE_HEIGHT_PX): string {
  return `repeating-linear-gradient(
    transparent,
    transparent ${lineHeightPx - 1}px,
    ${MOBILE_NOTEBOOK.rule} ${lineHeightPx - 1}px,
    ${MOBILE_NOTEBOOK.rule} ${lineHeightPx}px
  )`;
}

/** Full-screen mobile overlay shell — do NOT lock body overflow (breaks pinch-zoom scroll on iOS). */
export const MOBILE_OVERLAY_SHELL: CSSProperties = {
  fontFamily: MOBILE_SHELL_FONT,
  height: "100dvh",
  maxHeight: "100dvh",
  paddingTop: "env(safe-area-inset-top)",
  paddingBottom: "env(safe-area-inset-bottom)",
};

/** Scroll container inside a mobile overlay — one unified scroll area for header + content. */
export const MOBILE_OVERLAY_SCROLL: CSSProperties = {
  WebkitOverflowScrolling: "touch",
  overflowY: "scroll",
  overscrollBehaviorY: "auto",
};
