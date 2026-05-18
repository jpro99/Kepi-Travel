import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { isAdminUserId } from "@/lib/admin/adminAccess";

export default async function AdminPage() {
  const { userId } = await auth();
  if (!isAdminUserId(userId)) {
    redirect("/travel-assistant");
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <h1 className="text-2xl font-semibold">Kepi admin dashboard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Operations visibility across service health, alerts, background runs, and API usage.
          </p>
        </header>
        <AdminDashboardClient />
      </div>
    </main>
  );
}
