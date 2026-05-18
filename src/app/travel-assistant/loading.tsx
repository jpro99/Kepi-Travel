function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70 ${className}`}>
      <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-2 h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-100 px-3 py-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-4 sm:py-6">
      <div className="mx-auto max-w-[1400px] space-y-4 sm:space-y-5">
        <SkeletonCard className="min-h-28" />
        <section className="grid gap-4 sm:gap-5 lg:grid-cols-3">
          <SkeletonCard className="min-h-56 lg:col-span-2" />
          <SkeletonCard className="min-h-56" />
        </section>
        <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
          <SkeletonCard className="min-h-72" />
          <SkeletonCard className="min-h-72" />
        </section>
      </div>
    </main>
  );
}
