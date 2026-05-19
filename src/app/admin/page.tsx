import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { Logo } from "@/components/ui/Logo";
import { isAdminUserId } from "@/lib/admin/adminAccess";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  const { userId } = await auth();
  if (!isAdminUserId(userId)) {
    redirect("/travel-assistant");
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center gap-3">
            <Logo size="sm" />
            <h1 className="text-2xl font-semibold">admin dashboard</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Toggle between Operations and Insights to monitor reliability, adoption, and conversion health.
          </p>
        </header>
        <AdminDashboardClient />
      </div>
    </main>
  );
}
