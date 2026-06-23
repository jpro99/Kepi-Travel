"use client";

import { useState, useEffect } from "react";

export interface Flight {
  id: string;
  price: number;
  currency: string;
  airline: string;
  airlineName: string;
  departs: string;
  arrives: string;
  fromIata: string;
  toIata: string;
  stops: number;
  duration: string;
}

interface Passenger {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: "m" | "f";
  passportNumber: string;
  passportExpiry: string;
  passportCountry: string;
}

type CheckoutStep = "passengers" | "review" | "processing" | "confirmed" | "error";

function fmt12(iso: string) {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const EMPTY_PASSENGER: Passenger = {
  firstName: "", lastName: "", email: "", phone: "",
  dateOfBirth: "", gender: "m",
  passportNumber: "", passportExpiry: "", passportCountry: "US",
};

interface CheckoutFlowProps {
  flight: Flight;
  passengers: number;
  onCancel: () => void;
  onComplete: (bookingRef: string) => void;
}

export function CheckoutFlow({ flight, passengers: passengerCount, onCancel, onComplete }: CheckoutFlowProps) {
  const [step, setStep] = useState<CheckoutStep>("passengers");
  const [passengerForms, setPassengerForms] = useState<Passenger[]>(() =>
    Array.from({ length: passengerCount }, () => ({ ...EMPTY_PASSENGER }))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bookingRef, setBookingRef] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [savedDetails, setSavedDetails] = useState<Partial<Passenger> | null>(null);

  // Load saved passenger details
  useEffect(() => {
    fetch("/api/loyalty") // reuse loyalty endpoint pattern - genome contains saved details
      .then(r => r.json())
      .catch(() => null);
    // Actually fetch from genome via dedicated endpoint
    fetch("/api/orders/passenger-details")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.details) setSavedDetails(d.details); })
      .catch(() => null);
  }, []);

  const prefill = () => {
    if (!savedDetails) return;
    setPassengerForms(prev => prev.map((p, i) => i === 0 ? { ...p, ...savedDetails } : p));
  };

  const updatePassenger = (index: number, field: keyof Passenger, value: string) => {
    setPassengerForms(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    setErrors(prev => { const next = { ...prev }; delete next[`${index}_${field}`]; return next; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    passengerForms.forEach((p, i) => {
      if (!p.firstName.trim()) errs[`${i}_firstName`] = "Required";
      if (!p.lastName.trim()) errs[`${i}_lastName`] = "Required";
      if (!p.email.includes("@")) errs[`${i}_email`] = "Valid email required";
      if (!p.phone.replace(/\D/g, "").match(/^\d{10,15}$/)) errs[`${i}_phone`] = "Valid phone required";
      if (!p.dateOfBirth.match(/^\d{4}-\d{2}-\d{2}$/)) errs[`${i}_dateOfBirth`] = "Format: YYYY-MM-DD";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const placeOrder = async () => {
    setStep("processing");
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: flight.id,
          passengers: passengerForms,
          flightSummary: {
            from: flight.fromIata, to: flight.toIata,
            departs: flight.departs, price: flight.price, airline: flight.airline,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBookingError(data.error ?? "Booking failed. Please try again.");
        setStep("error");
        return;
      }
      setBookingRef(data.bookingReference ?? data.orderId);
      setStep("confirmed");
      onComplete(data.bookingReference ?? data.orderId);
    } catch {
      setBookingError("Connection error — please try again.");
      setStep("error");
    }
  };

  // ── Confirmed ─────────────────────────────────────────────────────────────
  if (step === "confirmed") {
    return (
      <div className="min-h-screen bg-[#0b1f3a] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-black text-white mb-2">You're booked!</h2>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 px-6 py-4 mb-6 w-full max-w-sm">
          <p className="text-xs text-slate-400 mb-1">Booking reference</p>
          <p className="text-3xl font-black text-emerald-400 tracking-widest">{bookingRef}</p>
          <p className="text-xs text-slate-400 mt-2">Screenshot or copy this — you'll need it at the airport</p>
        </div>
        <div className="rounded-2xl bg-[#111e33] border border-slate-700 px-5 py-4 mb-6 w-full max-w-sm text-left">
          <p className="text-xs text-slate-400">{flight.airline} · {flight.fromIata} → {flight.toIata}</p>
          <p className="font-bold text-white">{fmtDate(flight.departs)} · {fmt12(flight.departs)} → {fmt12(flight.arrives)}</p>
          <p className="text-[#f4c95d] font-black text-lg mt-1">${Math.round(flight.price).toLocaleString()}</p>
        </div>
        <p className="text-xs text-slate-400 mb-6 max-w-sm">
          A confirmation email will be sent to {passengerForms[0]?.email}. Check your spam folder if it doesn't arrive within 10 minutes.
        </p>
        <button type="button" onClick={() => window.location.href = "/travel-assistant"}
          className="w-full max-w-sm py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-base">
          View my trips →
        </button>
      </div>
    );
  }

  // ── Processing ─────────────────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div className="min-h-screen bg-[#0b1f3a] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4 animate-bounce">✈️</div>
        <h2 className="text-xl font-black text-white mb-2">Booking your flight…</h2>
        <p className="text-slate-400 text-sm">Confirming with the airline. Don't close this page.</p>
        <div className="mt-6 h-1 w-48 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-[#f4c95d] rounded-full animate-pulse" style={{ width: "60%" }} />
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen bg-[#0b1f3a] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">❌</div>
        <h2 className="text-xl font-black text-white mb-2">Booking failed</h2>
        <p className="text-slate-400 text-sm mb-4">{bookingError}</p>
        <p className="text-xs text-slate-500 mb-8">Your card was not charged. The flight may have sold out or the price changed.</p>
        <button type="button" onClick={() => setStep("review")}
          className="w-full max-w-sm py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black mb-3">
          Try again
        </button>
        <button type="button" onClick={onCancel} className="text-slate-400 text-sm">
          Back to search
        </button>
      </div>
    );
  }

  // ── Review ──────────────────────────────────────────────────────────────────
  if (step === "review") {
    return (
      <div className="min-h-screen bg-[#0b1f3a]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
          <button type="button" onClick={() => setStep("passengers")} className="text-slate-400 text-sm">← Edit</button>
          <h1 className="text-base font-black text-white">Review & pay</h1>
        </div>
        <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
          {/* Flight summary */}
          <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Your flight</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{flight.airline} · {flight.stops === 0 ? "Nonstop" : `${flight.stops} stop`}</p>
                <p className="text-lg font-bold text-white">{flight.fromIata} → {flight.toIata}</p>
                <p className="text-sm text-slate-300">{fmtDate(flight.departs)} · {fmt12(flight.departs)} → {fmt12(flight.arrives)}</p>
              </div>
              <p className="text-2xl font-black text-[#f4c95d]">${Math.round(flight.price)}</p>
            </div>
          </div>

          {/* Passenger summary */}
          {passengerForms.map((p, i) => (
            <div key={i} className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                Passenger {i + 1}
              </p>
              <p className="font-bold text-white">{p.firstName} {p.lastName}</p>
              <p className="text-sm text-slate-400">{p.email} · {p.phone}</p>
              <p className="text-sm text-slate-400">DOB: {p.dateOfBirth}</p>
              {p.passportNumber && <p className="text-sm text-slate-400">Passport: {p.passportNumber}</p>}
            </div>
          ))}

          {/* Price */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 px-5 py-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">Flights × {passengerCount}</span>
              <span className="text-white">${(flight.price * passengerCount).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm mb-3">
              <span className="text-slate-400">Taxes & fees</span>
              <span className="text-slate-400">Included</span>
            </div>
            <div className="flex justify-between font-black">
              <span className="text-white">Total charged now</span>
              <span className="text-[#f4c95d] text-xl">${(flight.price * passengerCount).toLocaleString()}</span>
            </div>
          </div>

          <p className="text-xs text-slate-500 text-center">
            By booking you agree to the airline's fare rules. No refunds on most economy fares. Travel insurance recommended.
          </p>

          <button type="button" onClick={placeOrder}
            className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-base active:opacity-80">
            Confirm & pay ${(flight.price * passengerCount).toLocaleString()} →
          </button>
          <button type="button" onClick={onCancel} className="w-full text-center text-slate-400 text-sm py-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Passengers form ────────────────────────────────────────────────────────
  const Field = ({ label, pIndex, field, type = "text", placeholder, required = false, half = false }: {
    label: string; pIndex: number; field: keyof Passenger; type?: string;
    placeholder?: string; required?: boolean; half?: boolean;
  }) => {
    const err = errors[`${pIndex}_${field}`];
    const val = passengerForms[pIndex]?.[field] ?? "";
    return (
      <div className={half ? "flex-1" : "w-full"}>
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
          {label}{required && <span className="text-red-400"> *</span>}
        </label>
        <input type={type} value={val as string}
          onChange={e => updatePassenger(pIndex, field, e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-2xl border px-4 py-3 text-sm text-white bg-slate-800 focus:outline-none ${err ? "border-red-500/60" : "border-slate-700 focus:border-[#f4c95d]/60"}`}
        />
        {err && <p className="text-[10px] text-red-400 mt-1">{err}</p>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0b1f3a]">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
        <button type="button" onClick={onCancel} className="text-slate-400 text-sm">← Back</button>
        <h1 className="text-base font-black text-white">Passenger details</h1>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        {/* Flight mini-card */}
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-3 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">{flight.fromIata} → {flight.toIata}</p>
            <p className="text-xs text-slate-400">{fmtDate(flight.departs)} · {fmt12(flight.departs)}</p>
          </div>
          <p className="text-lg font-black text-[#f4c95d]">${Math.round(flight.price)}</p>
        </div>

        {savedDetails?.firstName && (
          <button type="button" onClick={prefill}
            className="w-full mb-4 py-3 rounded-2xl border border-[#f4c95d]/30 text-[#f4c95d] text-sm font-bold">
            ↩ Prefill from last booking
          </button>
        )}

        {passengerForms.map((_, pIndex) => (
          <div key={pIndex} className="mb-6">
            {passengerCount > 1 && (
              <p className="text-sm font-black text-slate-400 mb-4">Passenger {pIndex + 1} of {passengerCount}</p>
            )}
            <div className="space-y-3">
              <div className="flex gap-3">
                <Field label="First name" pIndex={pIndex} field="firstName" placeholder="As on passport" required half />
                <Field label="Last name" pIndex={pIndex} field="lastName" placeholder="As on passport" required half />
              </div>
              <Field label="Email" pIndex={pIndex} field="email" type="email" placeholder="you@example.com" required />
              <Field label="Phone" pIndex={pIndex} field="phone" type="tel" placeholder="+1 555 000 0000" required />
              <div className="flex gap-3">
                <Field label="Date of birth" pIndex={pIndex} field="dateOfBirth" placeholder="YYYY-MM-DD" required half />
                <div className="flex-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Gender *</label>
                  <select value={passengerForms[pIndex]?.gender ?? "m"}
                    onChange={e => updatePassenger(pIndex, "gender", e.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:outline-none">
                    <option value="m">Male</option>
                    <option value="f">Female</option>
                  </select>
                </div>
              </div>

              {/* Passport — international flights */}
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 px-4 py-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Passport (required for international)</p>
                <Field label="Passport number" pIndex={pIndex} field="passportNumber" placeholder="A12345678" />
                <div className="flex gap-3">
                  <Field label="Expiry date" pIndex={pIndex} field="passportExpiry" placeholder="YYYY-MM-DD" half />
                  <Field label="Country" pIndex={pIndex} field="passportCountry" placeholder="US" half />
                </div>
              </div>
            </div>
          </div>
        ))}

        <button type="button"
          onClick={() => { if (validate()) setStep("review"); }}
          className="w-full py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-base active:opacity-80">
          Review booking →
        </button>
        <p className="text-[10px] text-slate-500 text-center mt-3">
          Your details are encrypted and only shared with the airline for this booking.
        </p>
      </div>
    </div>
  );
}
