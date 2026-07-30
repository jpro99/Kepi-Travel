import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold">Privacy Policy</h1>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          This is a placeholder privacy policy page for Kepi Travel Assistant. It will be replaced with final legal copy
          before public launch.
        </p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          <p>Summary placeholder topics:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Data collection and purpose</li>
            <li>Authentication and account security</li>
            <li>Email integration permissions</li>
            <li>
              Data retention and deletion controls — signed-in users can permanently delete their account
              in More → Delete account (or Billing), which removes trip data and the Clerk login.
            </li>
          </ul>
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
