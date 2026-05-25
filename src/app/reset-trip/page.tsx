"use client";

import { useState } from "react";

interface Reservation { id: string; type: string; provider: string; localTime: string; flightDate?: string; flightNumber?: string; }
interface TripData { tripId: string; tripName: string; reservationCount: number; reservations: Reservation[]; }

export default function ResetTripPage() {
  const [data, setData] = useState<TripData | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/clear-trip-reservations", { credentials: "include" });
    const j = await r.json() as TripData;
    setData(j);
    setLoading(false);
  };

  const wipe = async () => {
    if (!confirm("Wipe ALL reservations from Redis? You cannot undo this.")) return;
    setLoading(true);
    const r = await fetch("/api/admin/clear-trip-reservations", { method: "DELETE", credentials: "include" });
    const j = await r.json() as { message: string };
    setMsg(j.message ?? "Done");
    setData(null);
    setLoading(false);
  };

  return (
    <div style={{ padding: 24, fontFamily: "monospace", maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>🧹 Reset Trip Reservations</h1>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <button onClick={load} disabled={loading}
          style={{ background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
          {loading ? "Loading…" : "Show what's in Redis"}
        </button>
        <button onClick={wipe} disabled={loading}
          style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
          Wipe all reservations
        </button>
      </div>
      {msg && <p style={{ background: "#dcfce7", padding: 12, borderRadius: 8, marginBottom: 16 }}>{msg}</p>}
      {data && (
        <div>
          <p><strong>Trip:</strong> {data.tripName} ({data.tripId})</p>
          <p><strong>Reservations in Redis:</strong> {data.reservationCount}</p>
          <pre style={{ background: "#1e293b", color: "#e2e8f0", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12, marginTop: 12 }}>
            {JSON.stringify(data.reservations, null, 2)}
          </pre>
        </div>
      )}
      <p style={{ marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
        After wiping, go back to the app and add your real reservations once cleanly.
      </p>
    </div>
  );
}
