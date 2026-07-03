import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminBotDeckClient } from "@/components/admin/AdminBotDeckClient";
import { Logo } from "@/components/ui/Logo";
import { isAdminUserId } from "@/lib/admin/adminAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Bot Deck — Admin",
  robots: { index: false, follow: false },
};

export default async function AdminBotsPage() {
  const { userId } = await auth();
  if (!isAdminUserId(userId)) {
    redirect("/travel-assistant");
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center gap-3">
            <Logo size="sm" />
            <div>
              <h1 className="text-2xl font-semibold">🎯 Bot Deck</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Admin-only · Redis-backed · use from any device</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Local PC deck: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run bot-deck</code> edits git files.
            This page syncs tasks/memory in the cloud for when you&apos;re away.
          </p>
          <Link href="/admin" className="mt-2 inline-block text-sm font-semibold text-sky-600">
            ← Back to admin dashboard
          </Link>
        </header>
        <AdminBotDeckClient />
      </div>
    </main>
  );
}
