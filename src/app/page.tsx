import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-5 py-12 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-300">
          Kepi Travel Assistant
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
          Premium travel execution, from readiness to recovery.
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-slate-600 dark:text-slate-300 sm:text-base">
          Keep every reservation, handoff, and disruption response in one adaptive workflow designed to prevent misses
          and reduce travel stress.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/travel-assistant"
            className="inline-flex items-center justify-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            Get Started
          </Link>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mobile-first, dark-mode compatible, and built for live trip operations.
          </p>
        </div>
      </section>
    </main>
  );
}
