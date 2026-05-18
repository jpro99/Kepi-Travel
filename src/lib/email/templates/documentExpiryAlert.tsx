import type { CSSProperties, ReactElement } from "react";

export interface DocumentExpiryAlertTemplateItem {
  id: string;
  name: string;
  type: string;
  tripName: string;
  expiresAt: string;
}

export interface DocumentExpiryAlertTemplateProps {
  documents: DocumentExpiryAlertTemplateItem[];
  appLink: string;
  unsubscribeLink: string;
}

const shellStyle: CSSProperties = {
  margin: 0,
  padding: "24px 12px",
  backgroundColor: "#0f172a",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  color: "#e2e8f0",
};

function formatDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleDateString();
}

export function DocumentExpiryAlertEmail({
  documents,
  appLink,
  unsubscribeLink,
}: DocumentExpiryAlertTemplateProps): ReactElement {
  return (
    <html>
      <body style={shellStyle}>
        <section
          style={{
            maxWidth: "620px",
            margin: "0 auto",
            borderRadius: "14px",
            overflow: "hidden",
            border: "1px solid #334155",
            backgroundColor: "#111827",
          }}
        >
          <header style={{ padding: "18px 20px", backgroundColor: "#92400e" }}>
            <p style={{ margin: 0, fontSize: "12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Kepi document alert
            </p>
            <h1 style={{ margin: "8px 0 0", fontSize: "22px", lineHeight: 1.3 }}>Documents nearing expiration</h1>
          </header>

          <div style={{ padding: "16px 20px" }}>
            <p style={{ margin: 0, fontSize: "14px", color: "#cbd5e1", lineHeight: 1.6 }}>
              One or more travel documents expire soon. Review and refresh them before departure.
            </p>
            <ul style={{ margin: "12px 0 0", paddingLeft: "20px", fontSize: "14px", lineHeight: 1.7 }}>
              {documents.map((document) => (
                <li key={document.id}>
                  <strong>{document.name}</strong> ({document.type}) for <strong>{document.tripName}</strong> - expires{" "}
                  {formatDate(document.expiresAt)}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ padding: "0 20px 20px" }}>
            <a
              href={appLink}
              style={{
                display: "inline-block",
                textDecoration: "none",
                backgroundColor: "#f59e0b",
                color: "#111827",
                padding: "10px 16px",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "14px",
              }}
            >
              Open document vault
            </a>
            <p style={{ margin: "12px 0 0", fontSize: "12px", color: "#94a3b8", lineHeight: 1.6 }}>
              Manage email preferences here:{" "}
              <a href={unsubscribeLink} style={{ color: "#22d3ee" }}>
                unsubscribe
              </a>
              .
            </p>
          </div>
        </section>
      </body>
    </html>
  );
}
