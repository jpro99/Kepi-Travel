"use client";

import { useState, useEffect } from 'react';

export default function TracePage() {
    const [traceId, setTraceId] = useState('');
    const [trace, setTrace] = useState<any[]>([]);

    useEffect(() => {
        const url = new URL(window.location.href);
        const id = url.searchParams.get('id');
        if (id) {
            setTraceId(id);
        }
    }, []);

    useEffect(() => {
        if (traceId) {
            const fetchTrace = async () => {
                const response = await fetch(`/api/debug/trace?id=${traceId}`);
                const data = await response.json();
                setTrace(data.trace);
            };

            const interval = setInterval(fetchTrace, 2000);

            return () => clearInterval(interval);
        }
    }, [traceId]);

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold">Diagnostic Trace</h1>
            <input 
                type="text"
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                placeholder="Enter Trace ID"
                className="mt-4 p-2 border rounded"
            />
            <div className="mt-8 space-y-4">
                {trace.map((item, index) => {
                    const parsed = JSON.parse(item);
                    return (
                        <div key={index} className="p-4 bg-gray-100 rounded">
                            <p className="font-bold">{parsed.event}</p>
                            <pre className="mt-2 text-sm whitespace-pre-wrap">{JSON.stringify(parsed.data, null, 2)}</pre>
                            <p className="mt-2 text-xs text-gray-500">{new Date(parsed.timestamp).toISOString()}</p>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}
