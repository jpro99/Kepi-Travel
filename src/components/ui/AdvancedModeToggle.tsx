"use client";

interface AdvancedModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  description?: string;
}

export function AdvancedModeToggle({
  enabled,
  onChange,
  disabled = false,
  description = "Show the full power-user workspace with diagnostics, review tools, and operations panels.",
}: AdvancedModeToggleProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Advanced Mode</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={disabled}
          onClick={() => onChange(!enabled)}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full ring-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${
            enabled
              ? "bg-cyan-500 ring-cyan-300"
              : "bg-slate-200 ring-slate-300 dark:bg-slate-800 dark:ring-slate-700"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${
              enabled ? "translate-x-7" : "translate-x-1"
            }`}
          />
          <span className="sr-only">{enabled ? "Turn off Advanced Mode" : "Turn on Advanced Mode"}</span>
        </button>
      </div>
    </div>
  );
}
