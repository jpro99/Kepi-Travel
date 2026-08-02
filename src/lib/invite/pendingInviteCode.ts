import { isValidInviteCode, normalizeInviteCode } from "@/lib/invite/redeemInviteCodeClient";

export const PENDING_INVITE_CODE_STORAGE_KEY = "kepi:pending-invite-code";
export const INVITE_REDEEM_RESULT_EVENT = "kepi:invite-redeem-result";

export type InviteRedeemResultDetail =
  | {
      status: "success";
      code: string;
      plan: "lifetime" | "trial";
      restored?: boolean;
    }
  | {
      status: "error";
      code: string;
      error: string;
      reason?: string;
    };

/** Build /sign-in or /sign-up URL preserving the invite code query. */
export function authPathWithInviteCode(
  basePath: "/sign-in" | "/sign-up",
  inviteCode: string,
): string {
  const normalized = normalizeInviteCode(inviteCode);
  if (!isValidInviteCode(normalized)) {
    return basePath;
  }
  return `${basePath}?code=${encodeURIComponent(normalized)}`;
}

export function persistPendingInviteCode(code: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeInviteCode(code);
  if (!isValidInviteCode(normalized)) {
    return;
  }
  try {
    localStorage.setItem(PENDING_INVITE_CODE_STORAGE_KEY, normalized);
  } catch {
    // Ignore quota / private mode.
  }
}

export function readPendingInviteCode(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    const raw = normalizeInviteCode(localStorage.getItem(PENDING_INVITE_CODE_STORAGE_KEY) ?? "");
    return isValidInviteCode(raw) ? raw : "";
  } catch {
    return "";
  }
}

export function clearPendingInviteCode(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(PENDING_INVITE_CODE_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

const LAST_RESULT_STORAGE_KEY = "kepi:invite-redeem-last-result";

export function dispatchInviteRedeemResult(detail: InviteRedeemResultDetail): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(LAST_RESULT_STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // Ignore.
  }
  window.dispatchEvent(new CustomEvent(INVITE_REDEEM_RESULT_EVENT, { detail }));
}

export function readLastInviteRedeemResult(): InviteRedeemResultDetail | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(LAST_RESULT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as InviteRedeemResultDetail;
    if (parsed?.status === "success" || parsed?.status === "error") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLastInviteRedeemResult(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(LAST_RESULT_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function successMessageForPlan(plan: "lifetime" | "trial"): string {
  if (plan === "lifetime") {
    return "Lifetime access unlocked. You’re in.";
  }
  return "Your 30-day trial is active. You’re in.";
}
