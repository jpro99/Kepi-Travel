/**
 * Resend/Svix webhook signature policy for /api/email-forward/receive.
 * Production must never skip verification when the secret is unset (F12).
 */

export function shouldSkipWebhookSignatureVerification(env: {
  resendWebhookSecret?: string | null;
  vercelEnv?: string | null;
  nodeEnv?: string | null;
}): boolean {
  const secret = env.resendWebhookSecret?.trim() ?? "";
  if (secret) return false;
  const vercelEnv = env.vercelEnv?.trim() ?? "";
  const nodeEnv = env.nodeEnv?.trim() ?? "";
  const isProduction = vercelEnv === "production" || nodeEnv === "production";
  return !isProduction;
}
