"use client";

export function InviteCodeForm() {
  return (
    <div className="mt-7 rounded-2xl border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-500/30 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Have an invite code?</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget as HTMLFormElement).elements.namedItem("invite-code") as HTMLInputElement;
          const code = input.value.trim();
          if (code) window.location.href = `/sign-up?code=${encodeURIComponent(code)}`;
        }}
      >
        <input
          type="text"
          name="invite-code"
          placeholder="KEPI-FRIEND-XXXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-mono uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-500"
        >
          Join →
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Kepi is currently invite-only. Get a code from someone already using the app.
      </p>
    </div>
  );
}
