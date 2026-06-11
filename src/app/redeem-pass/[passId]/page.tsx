'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import Link from 'next/link';

export default function RedeemPassPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [plan, setPlan] = useState<'lifetime' | 'trial' | null>(null);
  const params = useParams();
  const router = useRouter();
  const passId = params.passId as string;

  useEffect(() => {
    if (!passId) {
      setStatus('error');
      setErrorMessage('No Kepi Pass ID was found in the URL.');
      return;
    }

    const redeem = async () => {
      try {
        const response = await fetch('/api/kepi-pass/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passId }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setPlan(data.plan);
          // Redirect to the travel assistant after a short delay
          setTimeout(() => {
            router.push('/travel-assistant');
          }, 3000);
        } else {
          setStatus('error');
          setErrorMessage(data.error || 'An unknown error occurred.');
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage('Failed to connect to the server. Please check your network and try again.');
      }
    };

    redeem();
  }, [passId, router]);

  const StatusDisplay = () => {
    switch (status) {
      case 'loading':
        return (
          <>
            <Loader className="animate-spin h-12 w-12 text-blue-500" />
            <h1 className="mt-4 text-2xl font-bold">Unboxing your Kepi Pass...</h1>
            <p className="text-slate-500">Please wait while we activate your premium access.</p>
          </>
        );
      case 'success':
        return (
          <>
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-bold">Welcome to Kepi!</h1>
            <p className="text-slate-500">
              Your {plan === 'lifetime' ? 'Lifetime Golden Pass' : 'Silver Pass'} has been successfully activated. Redirecting you to the app...
            </p>
          </>
        );
      case 'error':
        return (
          <>
            <XCircle className="h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-2xl font-bold">Redemption Failed</h1>
            <p className="text-slate-500 max-w-sm">{errorMessage}</p>
            <Link href="/" className="mt-6 inline-block rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
                Go to Homepage
            </Link>
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-center">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-12 shadow-2xl shadow-slate-300/20">
            <StatusDisplay />
        </div>
    </div>
  );
}
