import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900 p-24 text-foreground">
      <h1 className="mb-4 text-center text-4xl font-bold tracking-tight">
        Kepi Travel
      </h1>
      <p className="mb-2 max-w-md text-center text-lg text-muted-foreground">
        Travel decision engine — not a search box.
      </p>
      <p className="mb-10 max-w-lg text-center text-sm text-muted-foreground/80">
        Memory-first planning, strategy ranking, then seamless execution through departure.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/create"
          className="rounded-xl bg-emerald-600 px-8 py-3 text-center font-semibold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500"
        >
          Open Command Deck
        </Link>
        <Link
          href="/travel-assistant"
          className="rounded-xl border border-white/10 px-8 py-3 text-center font-medium text-muted-foreground hover:border-white/20 hover:text-foreground"
        >
          Travel Assistant
        </Link>
      </div>
    </main>
  );
}
