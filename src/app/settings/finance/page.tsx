'use client';

import { useState, useEffect } from 'react';
import type { FinancialProfile, CreditCard } from '@/lib/finance/types';

export default function FinanceSettingsPage() {
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const response = await fetch('/api/finance/profile');
      const data = await response.json();
      setProfile(data);
      setIsLoading(false);
    };
    fetchProfile();
  }, []);

  const handleToggle = async (key: keyof FinancialProfile) => {
    if (!profile) return;
    const updatedProfile = { ...profile, [key]: !profile[key] };
    setProfile(updatedProfile);

    await fetch('/api/finance/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProfile),
    });
  };

  if (isLoading) {
    return <div className="p-8">Loading financial settings...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold text-slate-800">Financial Concierge</h1>
        <p className="mt-2 text-slate-600">
          Automate your expense reports and optimize your credit card rewards.
        </p>

        <div className="mt-8 space-y-6 rounded-lg bg-white p-8 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-800">Zero-Touch Expense Reporting</h3>
              <p className="text-sm text-slate-500">Automatically generate expense reports for your trips.</p>
            </div>
            <button
              onClick={() => handleToggle('expenseReportingEnabled')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                profile?.expenseReportingEnabled ? 'bg-blue-600' : 'bg-slate-200'
              }`}>
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  profile?.expenseReportingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-800">Rewards Optimization</h3>
              <p className="text-sm text-slate-500">Get recommendations on the best card to use for each purchase.</p>
            </div>
            <button
              onClick={() => handleToggle('rewardsOptimizationEnabled')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                profile?.rewardsOptimizationEnabled ? 'bg-blue-600' : 'bg-slate-200'
              }`}>
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  profile?.rewardsOptimizationEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-white p-8 shadow-md">
          <h3 className="text-lg font-medium text-slate-800">Connected Cards</h3>
          <div className="mt-4 space-y-4">
            {profile?.connectedCards.map((card) => (
              <div key={card.id} className="p-4 bg-slate-100 rounded-lg">
                <p className="font-semibold text-slate-800">{card.name}</p>
                <p className="text-sm text-slate-600">**** **** **** {card.last4}</p>
              </div>
            ))}
          </div>
          <button className="mt-4 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
            Connect New Card
          </button>
        </div>

      </div>
    </div>
  );
}
