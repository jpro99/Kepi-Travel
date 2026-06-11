
'use client';

import { useEffect, useState, useMemo } from 'react';
import { KepiSentienceEngine } from '@/lib/sentience/engine';
import { JourneyPlan, ContextualPrompt, UserState } from '@/lib/sentience/types';

const initialUserState: UserState = {
  position: { x: 0, y: 0, z: 0 },
  velocity: 0,
  isMoving: false,
};

export function AirportMode() {
  const [flightNumber, setFlightNumber] = useState('');
  const [flightData, setFlightData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [journeyPlan, setJourneyPlan] = useState<JourneyPlan | null>(null);
  const [prompt, setPrompt] = useState<ContextualPrompt | null>(null);

  const engine = useMemo(() => new KepiSentienceEngine(initialUserState), []);

  useEffect(() => {
    // This will now only load the mock plan initially
    setJourneyPlan(engine.getJourneyPlan());
    setPrompt(engine.getContextualPrompt());
  }, [engine]);

  const handleSearch = async () => {
    if (!flightNumber) return;
    setIsLoading(true);
    await engine.initializeFlightData(flightNumber);
    setFlightData(engine.getFlightData());
    setIsLoading(false);
  };

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg max-w-md mx-auto">
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Enter Your Flight Number</h2>
        <div className="flex gap-2">
          <input 
            type="text"
            value={flightNumber}
            onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
            placeholder="e.g., UA123"
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            onClick={handleSearch}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {flightData && (
        <div className="mt-6 p-4 bg-gray-800 rounded-lg">
          <h3 className="font-bold text-lg">Flight Status</h3>
          <p>Flight: <span className="text-blue-400">{flightData.flight.iata}</span></p>
          <p>Status: <span className="text-green-400">{flightData.status}</span></p>
          <p>Departure Gate: <span className="text-yellow-400">{flightData.departure.gate}</span></p>
          <p>Boarding Time: <span className="text-red-400">{new Date(flightData.departure.estimated).toLocaleTimeString()}</span></p>
        </div>
      )}

      {journeyPlan && !flightData && (
        <div className="mt-6">
          {/* Mock journey plan is hidden once real data is loaded */}
        </div>
      )}
    </div>
  );
}
