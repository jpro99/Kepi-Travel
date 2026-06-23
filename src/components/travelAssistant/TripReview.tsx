"use client";

import { useState } from "react";
import type { TripRating } from "@/lib/learning/tripInsights";

interface TripReviewProps {
  tripId: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  flightNumber?: string;
  hotelName?: string;
  onComplete: () => void;
  onDismiss: () => void;
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`text-2xl transition ${n <= value ? "text-[#f4c95d]" : "text-slate-600"}`}>
          ★
        </button>
      ))}
    </div>
  );
}

export function TripReview({ tripId, destination, departDate, returnDate, flightNumber, hotelName, onComplete, onDismiss }: TripReviewProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState<Partial<TripRating>>({
    tripId, destination, departDate, returnDate,
    ratings: { overallTrip: 0 },
    feedback: { wouldReturn: true },
    packingFeedback: { overPacked: false, underPacked: false },
    flightFeedback: { onTime: true, flightNumber },
  });

  const update = (path: string, value: unknown) => {
    setRating(prev => {
      const next = { ...prev };
      const keys = path.split(".");
      let obj = next as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]!] = { ...(obj[keys[i]!] as Record<string, unknown>) };
        obj = obj[keys[i]!] as Record<string, unknown>;
      }
      obj[keys[keys.length - 1]!] = value;
      return next;
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rating),
      });
      onComplete();
    } catch {
      onComplete(); // dismiss anyway
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    // Step 0: Overall
    <div key="overall" className="space-y-5">
      <div className="text-center">
        <p className="text-2xl mb-1">🏁</p>
        <h3 className="text-xl font-black text-white">How was {destination}?</h3>
        <p className="text-slate-400 text-sm mt-1">Kepi learns from every trip to give you better recommendations</p>
      </div>
      <div>
        <p className="text-sm font-bold text-slate-300 mb-2">Overall trip</p>
        <Stars value={rating.ratings?.overallTrip ?? 0} onChange={n => update("ratings.overallTrip", n)} />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-300 mb-2">Flight experience</p>
        <Stars value={rating.ratings?.flightExperience ?? 0} onChange={n => update("ratings.flightExperience", n)} />
      </div>
      {hotelName && (
        <div>
          <p className="text-sm font-bold text-slate-300 mb-2">Hotel</p>
          <Stars value={rating.ratings?.hotelSatisfaction ?? 0} onChange={n => update("ratings.hotelSatisfaction", n)} />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">Would you return?</span>
        <div className="flex gap-2">
          {([true, false] as const).map(val => (
            <button key={String(val)} type="button"
              onClick={() => update("feedback.wouldReturn", val)}
              className={`rounded-xl px-4 py-2 text-sm font-bold border ${rating.feedback?.wouldReturn === val ? "bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]" : "border-slate-600 text-slate-400"}`}>
              {val ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // Step 1: Flight detail
    <div key="flight" className="space-y-4">
      <h3 className="text-lg font-black text-white">Flight feedback</h3>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">Was your flight on time?</span>
        <div className="flex gap-2">
          {([true, false] as const).map(val => (
            <button key={String(val)} type="button"
              onClick={() => update("flightFeedback.onTime", val)}
              className={`rounded-xl px-4 py-2 text-sm font-bold border ${rating.flightFeedback?.onTime === val ? "bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]" : "border-slate-600 text-slate-400"}`}>
              {val ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
      {!rating.flightFeedback?.onTime && (
        <div>
          <p className="text-sm text-slate-300 mb-1">How late? (minutes)</p>
          <input type="number" placeholder="e.g. 45"
            onChange={e => update("flightFeedback.delayMinutes", Number(e.target.value))}
            className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:outline-none" />
        </div>
      )}
      <div>
        <p className="text-sm font-bold text-slate-300 mb-2">Airline rating</p>
        <Stars value={rating.flightFeedback?.airlineRating ?? 0} onChange={n => update("flightFeedback.airlineRating", n)} />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-300 mb-2">Seat comfort</p>
        <Stars value={rating.flightFeedback?.seatComfort ?? 0} onChange={n => update("flightFeedback.seatComfort", n)} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">Would fly this airline again?</span>
        <div className="flex gap-2">
          {([true, false] as const).map(val => (
            <button key={String(val)} type="button"
              onClick={() => update("flightFeedback.wouldFlyAgain", val)}
              className={`rounded-xl px-3 py-2 text-xs font-bold border ${rating.flightFeedback?.wouldFlyAgain === val ? "bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]" : "border-slate-600 text-slate-400"}`}>
              {val ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // Step 2: Packing
    <div key="packing" className="space-y-4">
      <h3 className="text-lg font-black text-white">What about your packing?</h3>
      <p className="text-sm text-slate-400">Help Kepi build better lists for your next trip</p>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">Did you overpack?</span>
        <button type="button" onClick={() => update("packingFeedback.overPacked", !rating.packingFeedback?.overPacked)}
          className={`w-11 h-6 rounded-full transition relative ${rating.packingFeedback?.overPacked ? "bg-[#f4c95d]" : "bg-slate-600"}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${rating.packingFeedback?.overPacked ? "left-6" : "left-1"}`} />
        </button>
      </div>
      <div>
        <p className="text-sm text-slate-300 mb-2">What did you forget? <span className="text-slate-500">(optional)</span></p>
        <input type="text" placeholder="e.g. phone charger, sunscreen"
          onBlur={e => update("packingFeedback.forgotItems", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
          className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:outline-none" />
      </div>
      <div>
        <p className="text-sm text-slate-300 mb-2">What did you never use? <span className="text-slate-500">(optional)</span></p>
        <input type="text" placeholder="e.g. formal shoes, rain jacket"
          onBlur={e => update("packingFeedback.unnecessaryItems", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
          className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:outline-none" />
      </div>
    </div>,
  ];

  return (
    <div className="rounded-3xl border border-slate-700 bg-gradient-to-br from-[#111e33] to-[#0b1f3a] overflow-hidden">
      {/* Progress */}
      <div className="flex gap-1 p-4 pb-0">
        {steps.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[#f4c95d]" : "bg-slate-700"}`} />
        ))}
      </div>

      <div className="px-5 py-5">
        {steps[step]}
      </div>

      <div className="px-5 pb-5 flex gap-3">
        <button type="button" onClick={onDismiss}
          className="flex-1 py-3 rounded-2xl border border-slate-600 text-slate-400 text-sm font-bold">
          Skip
        </button>
        {step < steps.length - 1 ? (
          <button type="button" onClick={() => setStep(s => s + 1)}
            className="flex-1 py-3 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] text-sm font-black">
            Next →
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] text-sm font-black disabled:opacity-50">
            {saving ? "Saving…" : "Done ✓"}
          </button>
        )}
      </div>
    </div>
  );
}
