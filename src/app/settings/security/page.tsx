'use client';

import { useState, useEffect } from 'react';
import type { GuardianProfile } from '@/lib/guardian/types';

export default function SecuritySettingsPage() {
  const [profile, setProfile] = useState<GuardianProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const response = await fetch('/api/guardian/profile');
      const data = await response.json();
      setProfile(data);
      setIsLoading(false);
    };
    fetchProfile();
  }, []);

  const handleToggle = async (key: keyof GuardianProfile) => {
    if (!profile) return;
    const updatedProfile = { ...profile, [key]: !profile[key] };
    setProfile(updatedProfile);

    await fetch('/api/guardian/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProfile),
    });
  };

  if (isLoading) {
    return <div className="p-8">Loading security settings...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold text-slate-800">Kepi Guardian</h1>
        <p className="mt-2 text-slate-600">
          Manage your security preferences.
        </p>

        <div className="mt-8 space-y-6 rounded-lg bg-white p-8 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-800">Biometric Authentication</h3>
              <p className="text-sm text-slate-500">Use Face ID or Touch ID to secure your account.</p>
            </div>
            <button
              onClick={() => handleToggle('biometricAuthEnabled')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                profile?.biometricAuthEnabled ? 'bg-blue-600' : 'bg-slate-200'
              }`}>
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  profile?.biometricAuthEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-800">Continuous Authentication</h3>
              <p className="text-sm text-slate-500">Monitor for unusual activity and require re-authentication if needed.</p>
            </div>
            <button
              onClick={() => handleToggle('continuousAuthEnabled')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                profile?.continuousAuthEnabled ? 'bg-blue-600' : 'bg-slate-200'
              }`}>
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  profile?.continuousAuthEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-800">Virtual Card Numbers</h3>
              <p className="text-sm text-slate-500">Use single-use virtual cards for online bookings to protect your financial data.</p>
            </div>
            <button
              onClick={() => handleToggle('virtualCardEnabled')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                profile?.virtualCardEnabled ? 'bg-blue-600' : 'bg-slate-200'
              }`}>
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  profile?.virtualCardEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
