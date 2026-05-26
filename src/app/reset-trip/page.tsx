"use client";

import React, { useState } from "react";

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

  const [testText, setTestText] = React.useState("");
  const [testResult, setTestResult] = React.useState<string | null>(null);

  const testParser = async () => {
    const res = await fetch("/api/admin/test-parser", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailText: testText }),
    });
    const j = await res.json();
    setTestResult(JSON.stringify(j, null, 2));
  };

  return (
    <div style={{ padding: 24, fontFamily: "monospace", maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>🧹 Reset Trip Reservations</h1>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: "bold", marginBottom: 8 }}>🧪 Test parser (paste email text):</p>
        <textarea
          value={testText}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTestText(e.target.value)}
          rows={6}
          style={{ width: "100%", background: "#1e293b", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "monospace", fontSize: 12, marginBottom: 8 }}
          placeholder="Paste your flight confirmation email text here..."
        />
        <button onClick={() => void testParser()} style={{ background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", marginBottom: 8 }}>
          Test parser
        </button>
        {testResult && (
          <pre style={{ background: "#1e293b", color: "#e2e8f0", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 11 }}>
            {testResult}
          </pre>
        )}
      </div>

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

      {data && data.reservations && data.reservations.filter((r: Reservation) => r.type === "flight").map((r: Reservation) => (
        <div key={r.id} style={{ background: "#1e293b", color: "#e2e8f0", padding: 16, borderRadius: 8, marginBottom: 12 }}>
          <p style={{ fontWeight: "bold", marginBottom: 8 }}>✈️ Flight: {r.provider} {r.flightNumber} — ID: {r.id}</p>
          <p style={{ fontSize: 12, marginBottom: 8 }}>localTime: {r.localTime} | flightDate: {r.flightDate ?? "NOT SET"}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={async () => {
              const res = await fetch("/api/admin/fix-flight", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  reservationId: r.id,
                  flightDepartureTime: "2026-05-29 21:20",
                  flightDepartureAirport: "HND",
                  flightArrivalAirport: "HNL",
                  flightNumber: "AS832",
                  flightDate: "2026-05-29",
                })
              });
              const j = await res.json() as { ok?: boolean };
              setMsg(j.ok ? "✅ Fixed AS 832 HND→HNL 9:20 PM May 29" : "Error fixing flight");
            }} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
              Fix AS 832 → HND→HNL 9:20 PM May 29
            </button>
          </div>
        </div>
      ))}

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
