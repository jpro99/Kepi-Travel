'use client';

import { useState, useEffect } from 'react';
import type { BioHarmonizationPlan } from '@/lib/biometrics/types';

export default function BiometricsSettingsPage() {
  const [plan, setPlan] = useState<BioHarmonizationPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPlan = async () => {
      const response = await fetch('/api/biometrics/plan');
      const data = await response.json();
      setPlan(data);
      setIsLoading(false);
    };
    fetchPlan();
  }, []);

  const handleToggle = async (key: keyof BioHarmonizationPlan) => {
    if (!plan) return;
    const updatedPlan = { ...plan, [key]: !plan[key] };
    setPlan(updatedPlan);
    await updatePlan(updatedPlan);
  };

  const handleSelect = async (key: keyof BioHarmonizationPlan, value: string) => {
    if (!plan) return;
    const updatedPlan = { ...plan, [key]: value };
    setPlan(updatedPlan);
    await updatePlan(updatedPlan);
  }

  const updatePlan = async (updatedPlan: BioHarmonizationPlan) => {
    await fetch('/api/biometrics/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPlan),
    });
  }

  if (isLoading) {
    return <div className="p-8">Loading biometrics settings...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold text-slate-800">Bio-Harmonization</h1>
        <p className="mt-2 text-slate-600">
          Mitigate the stress of travel and arrive at your best.
        </p>

        <div className="mt-8 space-y-6 rounded-lg bg-white p-8 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-800">Jet Lag Neutralization</h3>
              <p className="text-sm text-slate-500">Receive a personalized protocol to minimize jet lag.</p>
            </div>
            <button
              onClick={() => handleToggle('jetLagProtocolEnabled')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                plan?.jetLagProtocolEnabled ? 'bg-blue-600' : 'bg-slate-200'
              }`}>
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  plan?.jetLagProtocolEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-800">Real-time Stress Monitoring</h3>
              <p className="text-sm text-slate-500">Get alerts and interventions if your travel becomes stressful.</p>
            </div>
            <button
              onClick={() => handleToggle('realtimeStressMonitoring')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                plan?.realtimeStressMonitoring ? 'bg-blue-600' : 'bg-slate-200'
              }`}>
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  plan?.realtimeStressMonitoring ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div>
            <label htmlFor="health-data" className="block text-lg font-medium text-slate-800">Health Data Integration</label>
            <p className="text-sm text-slate-500">Connect your health data for a more personalized experience.</p>
            <select
              id="health-data"
              value={plan?.healthDataIntegration || 'none'}
              onChange={(e) => handleSelect('healthDataIntegration', e.target.value)}
              className="mt-2 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="none">None</option>
              <option value="apple-health">Apple Health</option>
              <option value="google-fit">Google Fit</option>
            </select>
          </div>

        </div>
      </div>
    </div>
  );
}
