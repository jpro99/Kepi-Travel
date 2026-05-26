import { getSafeRedisClient } from "@/lib/redis";
import { notFound } from "next/navigation";

interface ShareReservation {
  id: string; type: string; title: string; provider: string;
  localTime: string; location: string; flightNumber: string;
  flightDate: string; flightDepartureAirport: string;
  flightArrivalAirport: string; checkOutDate: string;
}

interface ShareSnapshot {
  tripName: string; destination: string; startDate: string;
  reservations: ShareReservation[]; createdAt: string;
}

const TYPE_EMOJI: Record<string, string> = {
  flight: "✈️", hotel: "🏨", dinner: "🍽", train: "🚆", ride: "🚗",
};

function formatDate(localTime: string): string {
  const ms = Date.parse(localTime.replace(" ", "T"));
  if (isNaN(ms)) return localTime;
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(localTime: string): string {
  const ms = Date.parse(localTime.replace(" ", "T"));
  if (isNaN(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const raw = await getSafeRedisClient()?.get(`share:trip:${params.token}`);
  if (!raw) notFound();

  const trip = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as ShareSnapshot;
  const sorted = [...trip.reservations].sort((a, b) =>
    Date.parse((a.flightDate || a.localTime).replace(" ", "T")) -
    Date.parse((b.flightDate || b.localTime).replace(" ", "T"))
  );

  return (
    <div style={{ minHeight: "100dvh", background: "#0d1117", color: "#e6edf3", fontFamily: "system-ui, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ background: "#22d3ee", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#0d1117", fontSize: 16 }}>K</div>
            <span style={{ fontSize: 13, color: "#8b949e" }}>Shared via Kepi</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: "8px 0 4px" }}>{trip.tripName}</h1>
          {trip.destination && <p style={{ fontSize: 15, color: "#8b949e", margin: 0 }}>📍 {trip.destination}</p>}
        </div>

        {/* Reservations */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sorted.map((r) => (
            <div key={r.id} style={{
              background: r.type === "flight" ? "linear-gradient(135deg, #1a1030, #0d1117)" : "#161b22",
              border: `1px solid ${r.type === "flight" ? "#7c3aed40" : "#30363d"}`,
              borderRadius: 16, padding: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  background: r.type === "flight" ? "#7c3aed30" : "#21262d",
                  color: r.type === "flight" ? "#a78bfa" : "#8b949e",
                  padding: "3px 8px", borderRadius: 20,
                }}>
                  {TYPE_EMOJI[r.type] ?? "📌"} {r.type}
                </span>
                <span style={{ fontSize: 13, color: "#8b949e" }}>{formatDate(r.flightDate || r.localTime)}</span>
              </div>
              {r.type === "flight" ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
                    <div>
                      <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{r.flightDepartureAirport || "DEP"}</div>
                      <div style={{ fontSize: 12, color: "#8b949e" }}>{formatTime(r.localTime)}</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center", color: "#7c3aed" }}>
                      <div>──── ✈ ────</div>
                      {r.flightNumber && <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 4 }}>{r.flightNumber}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{r.flightArrivalAirport || "ARR"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#8b949e" }}>{r.provider}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 18, fontWeight: 700, margin: "4px 0" }}>{r.provider || r.title}</div>
                  {r.type === "hotel" && r.checkOutDate && (
                    <div style={{ fontSize: 13, color: "#8b949e" }}>
                      Check-in {formatDate(r.localTime)} → Check-out {formatDate(r.checkOutDate)}
                    </div>
                  )}
                  {r.location && <div style={{ fontSize: 12, color: "#6e7681", marginTop: 4 }}>📍 {r.location}</div>}
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 32, fontSize: 13, color: "#6e7681" }}>
          Shared read-only via <a href="https://kepi-search.vercel.app" style={{ color: "#22d3ee" }}>Kepi</a>
        </div>
      </div>
    </div>
  );
}
