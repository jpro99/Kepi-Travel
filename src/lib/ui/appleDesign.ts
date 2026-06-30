/** Shared Apple HIG visual primitives — layout-neutral class strings. */

export const APPLE_SHADOW_CARD = "shadow-[var(--shadow-card)]";

export const appleCard =
  "rounded-[var(--radius-card)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] transition-[box-shadow,opacity] duration-[220ms] ease-in-out";

export const appleCardInset =
  "rounded-[var(--radius-card)] bg-[var(--bg-card)] transition-[box-shadow,opacity] duration-[220ms] ease-in-out";

export const appleBtnPrimary =
  "rounded-[var(--radius-button)] bg-[var(--accent)] px-4 font-semibold text-white transition-[opacity,transform] duration-[220ms] ease-in-out active:opacity-80";

export const appleBtnSecondary =
  "rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--bg-card)] px-4 font-semibold text-[var(--text-primary)] transition-[opacity,background-color] duration-[220ms] ease-in-out active:opacity-80";

export const appleBtnDestructive =
  "rounded-[var(--radius-button)] bg-[var(--bg-card)] px-4 font-semibold text-[var(--destructive)] transition-opacity duration-[220ms] ease-in-out active:opacity-80";

export const appleBtnText =
  "font-semibold text-[var(--accent)] transition-opacity duration-[220ms] ease-in-out active:opacity-60";

export const applePageTitle = "text-[34px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]";

export const appleSectionHeader = "text-[22px] font-semibold text-[var(--text-primary)]";

export const appleCardTitle = "text-[17px] font-semibold text-[var(--text-primary)]";

export const appleBody = "text-[17px] font-normal text-[var(--text-primary)]";

export const appleMetadata = "text-[15px] font-normal text-[var(--text-secondary)]";

export const appleCaption = "text-[13px] font-normal text-[var(--text-tertiary)]";

export const appleLabel = "text-[13px] font-normal text-[var(--text-tertiary)]";

export const appleSuccessPill =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium text-[var(--success)]";

export const appleWarningPill =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium text-[var(--warning)]";

export const appleIconTile =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-grouped)] text-[var(--text-secondary)]";
