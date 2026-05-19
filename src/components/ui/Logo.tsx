import type { HTMLAttributes } from "react";

type LogoSize = "sm" | "md" | "lg";

interface LogoProps extends HTMLAttributes<HTMLDivElement> {
  size?: LogoSize;
  showWordmark?: boolean;
}

const SIZE_STYLES: Record<LogoSize, { mark: string; letter: string; word: string; gap: string }> = {
  sm: {
    mark: "h-7 w-7 rounded-lg",
    letter: "text-base",
    word: "text-lg",
    gap: "gap-2",
  },
  md: {
    mark: "h-9 w-9 rounded-xl",
    letter: "text-xl",
    word: "text-2xl",
    gap: "gap-2.5",
  },
  lg: {
    mark: "h-12 w-12 rounded-2xl",
    letter: "text-3xl",
    word: "text-4xl",
    gap: "gap-3",
  },
};

export function Logo({ size = "md", showWordmark = true, className = "", ...props }: LogoProps) {
  const styles = SIZE_STYLES[size];

  return (
    <div className={`inline-flex items-center ${styles.gap} ${className}`} aria-label="kepi" {...props}>
      <span
        aria-hidden
        className={`inline-flex ${styles.mark} items-center justify-center bg-[#1a1a2e] font-black tracking-tight text-cyan-200 shadow-sm ring-1 ring-white/10 dark:ring-cyan-300/30 ${styles.letter}`}
      >
        K
      </span>
      {showWordmark ? (
        <span className={`font-semibold tracking-tight text-slate-950 dark:text-slate-50 ${styles.word}`}>kepi</span>
      ) : null}
    </div>
  );
}
