'use client';

import { useState } from 'react';
import type { TripCanvas } from '@/lib/dreamcaster/types';
import { CheckCircle, ArrowRight, DollarSign, Star, Clock } from 'lucide-react';

function ValueInsightIcon({ type }: { type: string }) {
  switch (type) {
    case 'cost-saving':
      return <DollarSign className="h-5 w-5 text-green-500" />;
    case 'experience-upgrade':
      return <Star className="h-5 w-5 text-yellow-500" />;
    case 'time-saver':
      return <Clock className="h-5 w-5 text-blue-500" />;
    default:
      return <CheckCircle className="h-5 w-5 text-slate-500" />;
  }
}

export default function DreamcasterPage() {
  const [prompt, setPrompt] = useState('');
  const [tripCanvas, setTripCanvas] = useState<TripCanvas | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsLoading(true);
    const response = await fetch('/api/dreamcaster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await response.json();
    setTripCanvas(data);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          Kepi Dreamcaster
        </h1>
        <p className="mt-6 text-lg leading-8 text-slate-600">
          Tell us your travel dreams, and we'll weave them into a perfect reality.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., a culinary tour of Italy"
            className="flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
          >
            {isLoading ? 'Dreaming...' : 'Generate'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="mx-auto max-w-2xl mt-16 text-center">
          <p className="text-slate-600">Dreaming up your perfect trip...</p>
        </div>
      )}

      {tripCanvas && !isLoading && (
        <div className="mx-auto max-w-2xl mt-16 bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-slate-900">{tripCanvas.title}</h2>
          <p className="mt-4 text-slate-600">{tripCanvas.narrative}</p>

          <div className="mt-8">
            <h3 className="text-lg font-bold text-slate-800">Your Trip Canvas</h3>
            <ul className="mt-4 space-y-4">
              {tripCanvas.steps.map((step, index) => (
                <li key={index} className="p-4 bg-slate-50 rounded-lg">
                  <p className="font-semibold text-slate-800">{step.description}</p>
                  <p className="text-sm text-slate-600">{step.details}</p>
                  <p className="text-sm text-slate-500 mt-2">Value: {step.valueProposition}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-bold text-slate-800">Value Stream</h3>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-green-100 rounded-lg">
                <p className="text-sm text-green-700">Savings</p>
                <p className="text-2xl font-bold text-green-800">${tripCanvas.valueStream.savings}</p>
              </div>
              <div className="p-4 bg-blue-100 rounded-lg">
                <p className="text-sm text-blue-700">Total Cost</p>
                <p className="text-2xl font-bold text-blue-800">${tripCanvas.valueStream.totalCost}</p>
              </div>
              <div className="p-4 bg-purple-100 rounded-lg">
                <p className="text-sm text-purple-700">Total Value</p>
                <p className="text-2xl font-bold text-purple-800">${tripCanvas.valueStream.totalValue}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {tripCanvas.valueStream.valueInsights.map((insight, index) => (
                <li key={index} className="flex items-center gap-3 text-sm text-slate-600">
                  <ValueInsightIcon type={insight.type} />
                  <span>{insight.description}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      )}
    </div>
  );
}
