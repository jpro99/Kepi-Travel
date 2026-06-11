"use client";

import { useSearchParams } from 'next/navigation';
import { ExpenseReport } from '../travel-assistant/components/ExpenseReport';

export default function ExpenseReportPage() {
    const searchParams = useSearchParams();
    const tripId = searchParams.get('tripId');

    return (
        <div className="relative isolate min-h-screen bg-slate-100 dark:bg-slate-950">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <ExpenseReport tripId={tripId} />
            </div>
        </div>
    );
}
