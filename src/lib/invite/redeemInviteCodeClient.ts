export type RedeemInviteCodeClientResult = {
  ok: boolean;
  restored?: boolean;
  plan?: "lifetime" | "trial";
  trialExpiresAt?: string | null;
  error?: string;
  reason?: string;
};

const INVITE_CODE_PATTERN = /^[A-Z0-9-]{1,50}$/u;

export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidInviteCode(value: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(value));
}

export function dispatchBillingRefresh(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("kepi:billing-refresh"));
}

export async function redeemInviteCodeClient(code: string): Promise<RedeemInviteCodeClientResult> {
  const normalized = normalizeInviteCode(code);
  if (!isValidInviteCode(normalized)) {
    return { ok: false, error: "Invalid invite code format." };
  }

  const response = await fetch("/api/invite/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalized }),
  });

  const payload = (await response.json()) as RedeemInviteCodeClientResult;

  if (response.ok && payload.ok) {
    dispatchBillingRefresh();
    return payload;
  }

  return {
    ok: false,
    error: payload.error ?? "Invite code could not be redeemed.",
    reason: payload.reason,
  };
}
