"use client";

interface ActiveUsersCardProps {
  activeSessionUsers: number;
  pushSubscriptionUsers: number;
  calendarSyncUsers: number;
  loading: boolean;
}

export function ActiveUsersCard({
  activeSessionUsers,
  pushSubscriptionUsers,
  calendarSyncUsers,
  loading,
}: ActiveUsersCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <h2 className="text-lg font-semibold">Active users</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Live counts from KV-backed activity footprints.
      </p>
      {loading ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Loading activity metrics…</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-xs text-slate-600 dark:text-slate-400">Session users</p>
            <p className="text-2xl font-semibold">{activeSessionUsers}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-xs text-slate-600 dark:text-slate-400">Push subscriptions</p>
            <p className="text-2xl font-semibold">{pushSubscriptionUsers}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-xs text-slate-600 dark:text-slate-400">Calendar sync enabled</p>
            <p className="text-2xl font-semibold">{calendarSyncUsers}</p>
          </article>
        </div>
      )}
    </section>
  );
}
