import type { CSSProperties, ReactElement } from "react";

export interface InviteEmailProps {
  recipientEmail: string;
  inviteCode: string;
  inviteType: "lifetime" | "trial-30";
  redeemUrl: string;
  senderName?: string;
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
  fontSize: 28,
  fontWeight: 700,
  color: "#ffffff",
  letterSpacing: "-0.5px",
};

const subtitle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 14,
  color: "rgba(255,255,255,0.8)",
};

const codeBox: CSSProperties = {
  margin: "24px 0",
  padding: "20px",
  backgroundColor: "#f0f9ff",
  borderRadius: 12,
  border: "1.5px dashed #0ea5e9",
  textAlign: "center",
};

const codeLabel: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: "#0369a1",
};

const codeValue: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: "3px",
  color: "#0c2461",
  fontFamily: "monospace",
};

const ctaButton: CSSProperties = {
  display: "block",
  margin: "0 auto",
  padding: "16px 40px",
  backgroundColor: "#0ea5e9",
  color: "#ffffff",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 15,
  textAlign: "center",
  letterSpacing: "0.3px",
};

const helpText: CSSProperties = {
  margin: "20px 0 0",
  fontSize: 12,
  color: "#94a3b8",
  textAlign: "center",
  lineHeight: 1.6,
};

const footer: CSSProperties = {
  padding: "20px 32px",
  borderTop: "1px solid #f1f5f9",
  textAlign: "center",
};

const footerText: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "#94a3b8",
};

export function InviteEmail({
  inviteCode,
  inviteType,
  redeemUrl,
  senderName,
}: InviteEmailProps): ReactElement {
  const isLifetime = inviteType === "lifetime";
  const planLabel = isLifetime ? "Lifetime Access" : "30-Day Trial";
  const planDetail = isLifetime
    ? "Full access to Kepi — forever, at no cost to you."
    : "Full access to Kepi for 30 days, on us.";

  return (
    <div style={shell}>
      <div style={card}>
        {/* Header */}
        <div style={header}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 3, color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
            Kepi Travel
          </p>
          <h1 style={h1}>You&apos;re invited</h1>
          <p style={subtitle}>
            {senderName ? `${senderName} invited you to` : "You've been given"} {planLabel}
          </p>
        </div>

        {/* Body */}
        <div style={body}>
          <p style={{ margin: 0, fontSize: 15, color: "#334155", lineHeight: 1.7 }}>
            {planDetail} Kepi is a premium AI-powered travel execution app that keeps your trip on track — 
            from the moment you book to the moment you land.
          </p>

          {/* Code box */}
          <div style={codeBox}>
            <p style={codeLabel}>Your invite code</p>
            <p style={codeValue}>{inviteCode}</p>
          </div>

          {/* CTA */}
          <a href={redeemUrl} style={ctaButton}>
            Activate your {planLabel} →
          </a>

          <p style={helpText}>
            Or visit <span style={{ color: "#0ea5e9" }}>kepi-search.vercel.app</span> and enter your code manually.<br />
            This invite is single-use and linked to your account once redeemed.
          </p>
        </div>

        {/* Footer */}
        <div style={footer}>
          <p style={footerText}>Kepi · Premium AI Travel Execution · kepi-search.vercel.app</p>
        </div>
      </div>
    </div>
  );
}
