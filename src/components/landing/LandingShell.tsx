"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { CommandDeck } from "@/components/decision/CommandDeck";
import { LandingMarketing } from "@/components/landing/LandingMarketing";
import { Logo } from "@/components/ui/Logo";
import { type LandingTab, landingTabFromParam } from "@/lib/landing/landingContent";

interface LandingShellProps {
  userId: string | null;
  hasProAccess: boolean;
}

function tabHref(tab: LandingTab): string {
  return tab === "plan" ? "/?tab=plan" : "/";
}

function LandingShellInner({ userId, hasProAccess }: LandingShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = landingTabFromParam(searchParams.get("tab"));
  const authCtaHref = userId ? "/travel-assistant" : "/sign-up";

  const setTab = useCallback(
    (tab: LandingTab) => {
      router.replace(tabHref(tab), { scroll: false });
      if (tab === "plan") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [router],
  );

  const tabClass = (tab: LandingTab) =>
    [
      "rounded-lg px-3 py-2 text-sm font-semibold transition",
      activeTab === tab
        ? "bg-sky-600 text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
    ].join(" ");

  return (
    <main className="min-h-screen bg-[#f0f4f8] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Logo size="sm" />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900/70">
            <button type="button" className={tabClass("overview")} onClick={() => setTab("overview")}>
              Overview
            </button>
            <button type="button" className={tabClass("plan")} onClick={() => setTab("plan")}>
              Plan trip
            </button>
          </div>
          {userId ? (
            <Link
              href="/travel-assistant"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              Open app
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>

      {activeTab === "overview" ? (
        <LandingMarketing userId={userId} hasProAccess={hasProAccess} authCtaHref={authCtaHref} />
      ) : (
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-2 sm:px-8">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
              Command Deck
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Search flights, hotels, and trip strategies
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Describe where and when you want to go. Kepi ranks airports, loyalty plays, and out-of-pocket
              options — then you activate a strategy into your trip workspace.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-300 shadow-xl dark:border-slate-700">
            <CommandDeck embedded />
          </div>
        </section>
      )}
    </main>
  );
}

export function LandingShell(props: LandingShellProps) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f0f4f8] dark:bg-slate-950" />}>
      <LandingShellInner {...props} />
    </Suspense>
  );
}
