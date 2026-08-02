"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useBilling } from "@/lib/billing/BillingContext";
import {
  clearPendingInviteCode,
  dispatchInviteRedeemResult,
  persistPendingInviteCode,
  readPendingInviteCode,
} from "@/lib/invite/pendingInviteCode";
import { isValidInviteCode, normalizeInviteCode, redeemInviteCodeClient } from "@/lib/invite/redeemInviteCodeClient";

/** Only remember successful redeems so failures can be retried. */
const SUCCEEDED_CODES_STORAGE_KEY = "kepi:auto-redeem-succeeded";

function readSucceededCodes(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = sessionStorage.getItem(SUCCEEDED_CODES_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

function rememberSucceededCode(code: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const succeeded = readSucceededCodes();
  succeeded.add(code);
  try {
    sessionStorage.setItem(SUCCEEDED_CODES_STORAGE_KEY, JSON.stringify([...succeeded]));
  } catch {
    // Ignore storage failures.
  }
}

function stripInviteParamsFromUrl(pathname: string, searchParams: URLSearchParams): string | null {
  const nextParams = new URLSearchParams(searchParams.toString());
  let changed = false;
  for (const key of ["redeem", "code"]) {
    if (nextParams.has(key)) {
      nextParams.delete(key);
      changed = true;
    }
  }
  if (!changed) {
    return null;
  }
  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

async function runRedeem(code: string): Promise<void> {
  const result = await redeemInviteCodeClient(code);
  if (result.ok) {
    rememberSucceededCode(code);
    clearPendingInviteCode();
    dispatchInviteRedeemResult({
      status: "success",
      code,
      plan: result.plan === "trial" ? "trial" : "lifetime",
      restored: result.restored,
    });
    return;
  }
  dispatchInviteRedeemResult({
    status: "error",
    code,
    error: result.error ?? "Invite code could not be redeemed.",
    reason: result.reason,
  });
}

/**
 * When a signed-in user lands with ?redeem= / ?code= (or a pending localStorage code),
 * redeem immediately and surface success/error via `kepi:invite-redeem-result`.
 */
export function useAutoRedeemInviteFromUrl(): void {
  const { isLoaded, userId } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { refresh, isLifetime, hasProAccess } = useBilling();
  const redeemInFlightRef = useRef(false);
  const lastAttemptedRef = useRef<string>("");

  const inviteCodeFromUrl = useMemo(() => {
    const raw = normalizeInviteCode(searchParams.get("redeem") ?? searchParams.get("code") ?? "");
    return isValidInviteCode(raw) ? raw : "";
  }, [searchParams]);

  const resolveInviteCode = useCallback((): string => {
    if (inviteCodeFromUrl) {
      return inviteCodeFromUrl;
    }
    return readPendingInviteCode();
  }, [inviteCodeFromUrl]);

  useEffect(() => {
    if (inviteCodeFromUrl) {
      persistPendingInviteCode(inviteCodeFromUrl);
    }
  }, [inviteCodeFromUrl]);

  useEffect(() => {
    if (!isLoaded || !userId || redeemInFlightRef.current) {
      return;
    }

    const inviteCode = resolveInviteCode();
    if (!inviteCode) {
      return;
    }

    if (isLifetime || hasProAccess) {
      clearPendingInviteCode();
      rememberSucceededCode(inviteCode);
      const cleanedUrl = stripInviteParamsFromUrl(pathname, searchParams);
      if (cleanedUrl) {
        router.replace(cleanedUrl, { scroll: false });
      }
      return;
    }

    const succeeded = readSucceededCodes();
    if (succeeded.has(inviteCode)) {
      clearPendingInviteCode();
      const cleanedUrl = stripInviteParamsFromUrl(pathname, searchParams);
      if (cleanedUrl) {
        router.replace(cleanedUrl, { scroll: false });
      }
      return;
    }

    // Avoid tight re-fire loops for the same code while an attempt is settling.
    if (lastAttemptedRef.current === inviteCode) {
      return;
    }
    lastAttemptedRef.current = inviteCode;
    redeemInFlightRef.current = true;

    void (async () => {
      try {
        await runRedeem(inviteCode);
        await refresh();
        const cleanedUrl = stripInviteParamsFromUrl(pathname, searchParams);
        if (cleanedUrl) {
          router.replace(cleanedUrl, { scroll: false });
        }
      } finally {
        redeemInFlightRef.current = false;
      }
    })();
  }, [
    hasProAccess,
    inviteCodeFromUrl,
    isLifetime,
    isLoaded,
    pathname,
    refresh,
    resolveInviteCode,
    router,
    searchParams,
    userId,
  ]);

  // Allow banner Retry to re-run even after a failed attempt for the same code.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onRetry = (event: Event) => {
      const custom = event as CustomEvent<{ code?: string }>;
      const code = normalizeInviteCode(custom.detail?.code ?? resolveInviteCode());
      if (!isValidInviteCode(code) || redeemInFlightRef.current) {
        return;
      }
      lastAttemptedRef.current = "";
      redeemInFlightRef.current = true;
      void (async () => {
        try {
          await runRedeem(code);
          await refresh();
          const cleanedUrl = stripInviteParamsFromUrl(pathname, searchParams);
          if (cleanedUrl) {
            router.replace(cleanedUrl, { scroll: false });
          }
        } finally {
          redeemInFlightRef.current = false;
        }
      })();
    };
    window.addEventListener("kepi:invite-redeem-retry", onRetry);
    return () => window.removeEventListener("kepi:invite-redeem-retry", onRetry);
  }, [pathname, refresh, resolveInviteCode, router, searchParams]);
}

export function requestInviteRedeemRetry(code?: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent("kepi:invite-redeem-retry", {
      detail: { code: code ? normalizeInviteCode(code) : undefined },
    }),
  );
}
