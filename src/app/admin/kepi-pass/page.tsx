'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

export default function AdminKepiPassPage() {
  const { isSignedIn, orgRole } = useAuth();
  const [email, setEmail] = useState('');
  const [type, setType] = useState<'GOLDEN' | 'SILVER'>('SILVER');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const response = await fetch('/api/admin/kepi-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type, note }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(`Kepi Pass sent to ${email}! Pass ID: ${data.passId}`);
        setEmail('');
        setNote('');
      } else {
        setStatus('error');
        setMessage(data.error || 'An unknown error occurred.');
      }
    } catch (err) {
      setStatus('error');
      setMessage('Failed to connect to the server.');
    }
  };

  if (!isSignedIn || orgRole !== 'org:admin') {
    return <div className="p-8">You do not have permission to access this page.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold text-slate-800">Send a Kepi Pass</h1>
        <p className="mt-2 text-slate-600">
          Gift a premium Kepi Travel experience. Golden passes grant lifetime access, while Silver passes provide a one-year trial.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-lg bg-white p-8 shadow-md">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Recipient's Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-slate-700">
              Pass Type
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as 'GOLDEN' | 'SILVER')}
              className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="SILVER">Silver Pass (1-Year Trial)</option>
              <option value="GOLDEN">Golden Pass (Lifetime)</option>
            </select>
          </div>

          <div>
            <label htmlFor="note" className="block text-sm font-medium text-slate-700">
              Optional Note
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {status === 'loading' ? 'Sending...' : 'Send Kepi Pass'}
            </button>
          </div>
        </form>

        {status === 'success' && (
          <div className="mt-4 rounded-md bg-green-50 p-4 text-green-700">
            {message}
          </div>
        )}
        {status === 'error' && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-red-700">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
