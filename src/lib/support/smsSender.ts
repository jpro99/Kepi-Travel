import { logger } from "@/lib/logger";

export interface SmsPayload {
  to: string;
  body: string;
}

/** Send an SMS via Twilio. Returns true on success. */
export async function sendSms(payload: SmsPayload): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !from) {
    logger.warn("Twilio env vars missing — SMS not sent.", {
      hasSid: Boolean(accountSid),
      hasToken: Boolean(authToken),
      hasFrom: Boolean(from),
    });
    return false;
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const body = new URLSearchParams({
    From: from,
    To: payload.to,
    Body: payload.body,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "(unreadable)");
      logger.warn("Twilio SMS send failed.", { status: response.status, body: text.slice(0, 200) });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn("Twilio SMS threw.", { error: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}

/** Build the SMS text Jeff receives when a user files a bug. */
export function buildOwnerAlertSms(args: {
  ticketId: string;
  summary: string;
  confidence: string;
  category: string;
  issueUrl?: string | null;
  appUrl?: string;
}): string {
  const lines = [
    `KEPI BUG [${args.confidence.toUpperCase()}] #${args.ticketId}`,
    `${args.category}: ${args.summary.slice(0, 100)}`,
    args.issueUrl ? `GH: ${args.issueUrl}` : null,
    `Reply YES to queue AI fix. Reply NO to dismiss.`,
  ].filter(Boolean);
  return lines.join("\n");
}
