"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ExpenseReport } from "../travel-assistant/components/ExpenseReport";

export default function ExpenseReportPage() {
  return (
    <Suspense
      fallback={
        <div className="relative isolate min-h-screen bg-slate-100 p-8 text-center dark:bg-slate-950">
          <p className="text-slate-600 dark:text-slate-300">Loading expense report…</p>
        </div>
      }
    >
      <ExpenseReportContent />
    </Suspense>
  );
}

function ExpenseReportContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("tripId") ?? "";

  if (!tripId) {
    return (
      <div className="relative isolate min-h-screen bg-slate-100 p-8 text-center dark:bg-slate-950">
        <p className="text-slate-600 dark:text-slate-300">Missing trip ID.</p>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <ExpenseReport tripId={tripId} />
      </div>
    </div>
  );
}
