'use client';

import { useState, useEffect } from 'react';
import type { SovereignKey, DigitalValet } from '@/lib/sovereign/types';

export default function SovereignSettingsPage() {
  const [key, setKey] = useState<SovereignKey | null>(null);
  const [valets, setValets] = useState<DigitalValet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch('/api/sovereign/manage');
      const data = await response.json();
      setKey(data.sovereignKey);
      setValets(data.digitalValets);
      setIsLoading(false);
    };
    fetchData();
  }, []);

  const handleCreateKey = async () => {
    const response = await fetch('/api/sovereign/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-key' }),
    });
    const data = await response.json();
    setKey(data.sovereignKey);
  };

  const handleDeployValet = async () => {
    const response = await fetch('/api/sovereign/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deploy-valet',
        payload: { name: 'American Airlines Valet', provider: 'airline', legacySystem: 'AAdvantage' },
      }),
    });
    const data = await response.json();
    setValets(data.digitalValets);
  };

  if (isLoading) {
    return <div className="p-8">Loading sovereign settings...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold text-slate-800">Sovereign Key & Digital Valets</h1>
        <p className="mt-2 text-slate-600">
          Manage your digital identity and autonomous agents.
        </p>

        <div className="mt-8 rounded-lg bg-white p-8 shadow-md">
          <h3 className="text-lg font-medium text-slate-800">Sovereign Key</h3>
          {key ? (
            <div className="mt-4 p-4 bg-slate-100 rounded-lg">
              <p className="text-sm text-slate-600">Your Sovereign Key is active.</p>
              <p className="text-xs text-slate-500 mt-2 truncate">DID: {key.did}</p>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-slate-600">Create a Sovereign Key to take control of your travel data.</p>
              <button
                onClick={handleCreateKey}
                className="mt-4 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                Create Key
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-lg bg-white p-8 shadow-md">
          <h3 className="text-lg font-medium text-slate-800">Digital Valets</h3>
          <div className="mt-4 space-y-4">
            {valets.map((valet) => (
              <div key={valet.id} className="p-4 bg-slate-100 rounded-lg">
                <p className="font-semibold text-slate-800">{valet.name}</p>
                <p className="text-sm text-slate-600">Provider: {valet.provider}</p>
                <p className="text-sm text-slate-500">Status: {valet.status}</p>
              </div>
            ))}
          </div>
          <button
            onClick={handleDeployValet}
            className="mt-4 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            Deploy New Valet
          </button>
        </div>

      </div>
    </div>
  );
}
