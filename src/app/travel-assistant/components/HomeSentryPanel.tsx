
"use client";

import { useState, useEffect } from 'react';

export function HomeSentryPanel() {
    const [status, setStatus] = useState("Checking...");

    useEffect(() => {
        // In the future, this will fetch data from the /api/home-sentry endpoint
        // and determine the status based on the user's travel itinerary.
        const isTraveling = true; // For now, we'll assume the user is always traveling.
        setStatus(isTraveling ? "Away" : "At Home");
    }, []);

    return (
        <div className="rounded-3xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Home Sentry</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Your home is being monitored while you are away.</p>

            <div className="mt-6">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Status</p>
                <p className={`text-2xl font-bold ${status === 'Away' ? 'text-blue-500' : 'text-green-500'}`}>
                    {status}
                </p>
            </div>
        </div>
    );
}
