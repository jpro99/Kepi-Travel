import type { ReactElement } from "react";

export interface ReferralRewardTemplateProps {
  headline: string;
  intro: string;
  awardedDays: number;
  totalDaysEarned?: number;
  referralCode: string;
  appLink: string;
  unsubscribeLink: string;
}

export function ReferralRewardEmail({
  headline,
  intro,
  awardedDays,
  totalDaysEarned,
  referralCode,
  appLink,
  unsubscribeLink,
}: ReferralRewardTemplateProps): ReactElement {
  return (
    <html>
      <body style={{ margin: 0, backgroundColor: "#f8fafc", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          width="100%"
          style={{ maxWidth: "640px", margin: "0 auto", padding: "24px" }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  borderRadius: "16px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  padding: "24px",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "#0891b2",
                  }}
                >
                  Kepi Referral Rewards
                </p>
                <h1 style={{ margin: "12px 0 8px", fontSize: "24px", lineHeight: 1.3 }}>{headline}</h1>
                <p style={{ margin: "0 0 14px", fontSize: "14px", lineHeight: 1.5, color: "#334155" }}>{intro}</p>
                <p style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 700 }}>{awardedDays} free Pro days added</p>
                {typeof totalDaysEarned === "number" ? (
                  <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#475569" }}>
                    Total referral days earned: {totalDaysEarned}
                  </p>
                ) : null}
                <div
                  style={{
                    borderRadius: "10px",
                    border: "1px dashed #94a3b8",
                    backgroundColor: "#f8fafc",
                    padding: "12px",
                    margin: "0 0 18px",
                  }}
                >
                  <p style={{ margin: 0, fontSize: "12px", color: "#475569" }}>Your referral code</p>
                  <p style={{ margin: "6px 0 0", fontSize: "20px", letterSpacing: "0.12em", fontWeight: 700 }}>
                    {referralCode}
                  </p>
                </div>
                <a
                  href={appLink}
                  style={{
                    display: "inline-block",
                    borderRadius: "10px",
                    backgroundColor: "#06b6d4",
                    color: "#082f49",
                    fontSize: "14px",
                    fontWeight: 700,
                    padding: "10px 16px",
                    textDecoration: "none",
                  }}
                >
                  Open Kepi
                </a>
                <p style={{ margin: "18px 0 0", fontSize: "12px", color: "#64748b" }}>
                  Prefer fewer emails? <a href={unsubscribeLink}>Unsubscribe</a>
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
