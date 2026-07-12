import type { CSSProperties, ReactElement } from "react";
import { getAppHostname } from "@/lib/utils/appUrl";

export interface TripShareEmailProps {
  recipientEmail: string;
  tripName: string;
  destination?: string;
  shareUrl: string;
  senderName?: string;
  expiresAt: string;
  /** When true, invitee can open the trip in My Trips and edit with the owner (both need Pro). */
  canEditTogether?: boolean;
}

const shell: CSSProperties = {
  margin: 0,
  padding: "40px 16px",
  backgroundColor: "#f0f4f8",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};

const card: CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
};

const header: CSSProperties = {
  background: "linear-gradient(135deg, #0c2461 0%, #1a56b0 60%, #0ea5e9 100%)",
  padding: "40px 32px 32px",
  textAlign: "center",
};

const body: CSSProperties = { padding: "32px 32px 24px" };

const h1: CSSProperties = {
  margin: 0,
  fontSize: 26,
  fontWeight: 700,
  color: "#ffffff",
  letterSpacing: "-0.5px",
};

const subtitle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 14,
  color: "rgba(255,255,255,0.85)",
  lineHeight: 1.5,
};

const ctaButton: CSSProperties = {
  display: "block",
  margin: "0 auto",
  padding: "16px 40px",
  backgroundColor: "#0ea5e9",
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 700,
  textDecoration: "none",
  borderRadius: 12,
  textAlign: "center",
};

const noteBox: CSSProperties = {
  margin: "24px 0 0",
  padding: "16px",
  backgroundColor: "#f0f9ff",
  borderRadius: 12,
  border: "1px solid #bae6fd",
};

export function TripShareEmail({
  recipientEmail,
  tripName,
  destination,
  shareUrl,
  senderName,
  expiresAt,
  canEditTogether = false,
}: TripShareEmailProps): ReactElement {
  const host = getAppHostname();
  const expiryLabel = new Date(expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <html lang="en">
      <body style={shell}>
        <div style={card}>
          <div style={header}>
            <h1 style={h1}>
              {canEditTogether ? "Plan this trip together" : "You're invited to view a trip"}
            </h1>
            <p style={subtitle}>
              {senderName ? `${senderName} shared` : "Someone shared"} <strong>{tripName}</strong>
              {destination ? ` · ${destination}` : ""} with you on Kepi Travel.
            </p>
          </div>
          <div style={body}>
            <p style={{ margin: "0 0 16px", fontSize: 15, color: "#334155", lineHeight: 1.6 }}>
              {canEditTogether
                ? "Open the trip in your Kepi account to edit flights, hotels, and notes together. Both of you need Pro or Lifetime."
                : "Open the itinerary, browse trip photos at the bottom, leave comments, and build your own keepsake collage."}
            </p>
            <a href={shareUrl} style={ctaButton}>
              {canEditTogether ? "Open & edit together →" : "View trip →"}
            </a>
            <div style={noteBox}>
              <p style={{ margin: 0, fontSize: 13, color: "#0369a1", lineHeight: 1.6 }}>
                <strong>Private link for {recipientEmail} only.</strong> Sign in with this exact email to open the
                trip. The link will not work for anyone else, even if it is forwarded.
              </p>
            </div>
            <p style={{ margin: "20px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
              Link expires {expiryLabel}.
              {canEditTogether
                ? " After you join, the trip appears in My Trips for both of you."
                : ' Trip photos are at the bottom of the page — scroll down or tap "Jump to photos" when you arrive.'}
            </p>
            <p style={{ margin: "16px 0 0", fontSize: 11, color: "#94a3b8" }}>
              {host} · Kepi Travel
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
