"use client";

import { useMemo, useState } from "react";
import { SignUp } from "@clerk/nextjs";

const ALPHANUMERIC_HYPHEN_CODE_REGEX = /^[A-Z0-9-]{1,50}$/u;
const INVITE_CODE_REGEX = /^KEPI-FRIEND-[A-Z0-9-]{1,38}$/u;
const REFERRAL_CODE_REGEX = /^[A-Z0-9]{8}$/u;

function normalizeCode(value: string): string {
  return value.toUpperCase().replaceAll(/\s+/g, "").trim();
}

function isInviteCode(value: string): boolean {
  return INVITE_CODE_REGEX.test(value);
}

function isReferralCode(value: string): boolean {
  return REFERRAL_CODE_REGEX.test(value);
}

export default function SignUpPage() {
  const [inputCode, setInputCode] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [codeMessage, setCodeMessage] = useState<string | null>(null);

  const normalizedInputCode = normalizeCode(inputCode);
  const isCodeFormatValid =
    normalizedInputCode.length === 0 ||
    (ALPHANUMERIC_HYPHEN_CODE_REGEX.test(normalizedInputCode) &&
      (isInviteCode(normalizedInputCode) || isReferralCode(normalizedInputCode)));

  const redirectUrl = useMemo(() => {
    if (isInviteCode(appliedCode)) {
      return `/billing?redeemCode=${encodeURIComponent(appliedCode)}`;
    }
    if (isReferralCode(appliedCode)) {
      return `/travel-assistant?ref=${encodeURIComponent(appliedCode)}`;
    }
    return "/travel-assistant";
  }, [appliedCode]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-6 p-4">
      <section className="w-full max-w-md rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-600/50 dark:bg-emerald-950/40">
        <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">Have an invite code?</h2>
        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
          Enter your invite or referral code now so we can apply it as soon as your account is created.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={inputCode}
            onChange={(event) => setInputCode(event.target.value)}
            placeholder="KEPI-FRIEND-ABC123 or ABCD1234"
            className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm uppercase tracking-wide text-slate-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => {
              if (!normalizedInputCode) {
                setAppliedCode("");
                setCodeMessage("Code cleared.");
                return;
              }
              if (
                !ALPHANUMERIC_HYPHEN_CODE_REGEX.test(normalizedInputCode) ||
                (!isInviteCode(normalizedInputCode) && !isReferralCode(normalizedInputCode))
              ) {
                setCodeMessage("Code format is invalid. Use KEPI-FRIEND-XXXXXX or 8-character referral code.");
                return;
              }
              setAppliedCode(normalizedInputCode);
              setCodeMessage("Code saved. Continue sign-up to apply it automatically.");
            }}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            Save code
          </button>
        </div>
        {!isCodeFormatValid ? (
          <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
            Invalid code format. Use KEPI-FRIEND-XXXXXX or an 8-character referral code.
          </p>
        ) : null}
        {codeMessage ? <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">{codeMessage}</p> : null}
      </section>
      <div className="w-full max-w-md">
        <SignUp forceRedirectUrl={redirectUrl} signInForceRedirectUrl={redirectUrl} />
      </div>
    </main>
  );
}
