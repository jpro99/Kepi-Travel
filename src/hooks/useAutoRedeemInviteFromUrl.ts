"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useBilling } from "@/lib/billing/BillingContext";
import { isValidInviteCode, normalizeInviteCode, redeemInviteCodeClient } from "@/lib/invite/redeemInviteCodeClient";

const ATTEMPTED_CODES_STORAGE_KEY = "kepi:auto-redeem-attempted";

function readAttemptedCodes(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = sessionStorage.getItem(ATTEMPTED_CODES_STORAGE_KEY);
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

function rememberAttemptedCode(code: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const attempted = readAttemptedCodes();
  attempted.add(code);
  try {
    sessionStorage.setItem(ATTEMPTED_CODES_STORAGE_KEY, JSON.stringify([...attempted]));
  } catch {
    // Ignore storage failures — worst case we retry redeem once.
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

/**
 * When a signed-in user lands with ?redeem= or ?code= in the URL, redeem immediately
 * and refresh billing so lifetime/trial shows without manual steps in onboarding.
 */
export function useAutoRedeemInviteFromUrl(): void {
  const { isLoaded, userId } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { refresh, isLifetime, hasProAccess } = useBilling();
  const redeemInFlightRef = useRef(false);

  const inviteCodeFromUrl = useMemo(() => {
    const raw = normalizeInviteCode(searchParams.get("redeem") ?? searchParams.get("code") ?? "");
    return isValidInviteCode(raw) ? raw : "";
  }, [searchParams]);

  useEffect(() => {
    if (!isLoaded || !userId || !inviteCodeFromUrl || redeemInFlightRef.current) {
      return;
    }
    if (isLifetime || hasProAccess) {
      const cleanedUrl = stripInviteParamsFromUrl(pathname, searchParams);
      if (cleanedUrl) {
        router.replace(cleanedUrl, { scroll: false });
      }
      return;
    }

    const attempted = readAttemptedCodes();
    if (attempted.has(inviteCodeFromUrl)) {
      return;
    }

    redeemInFlightRef.current = true;
    rememberAttemptedCode(inviteCodeFromUrl);

    void (async () => {
      try {
        const result = await redeemInviteCodeClient(inviteCodeFromUrl);
        if (result.ok) {
          await refresh();
          const cleanedUrl = stripInviteParamsFromUrl(pathname, searchParams);
          if (cleanedUrl) {
            router.replace(cleanedUrl, { scroll: false });
          }
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
    router,
    searchParams,
    userId,
  ]);
}
