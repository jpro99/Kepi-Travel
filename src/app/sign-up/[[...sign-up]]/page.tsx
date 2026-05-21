"use client";

import { useMemo, useState } from "react";
import { SignUp } from "@clerk/nextjs";

const ALPHANUMERIC_HYPHEN_CODE_REGEX = /^[A-Z0-9-]{1,50}$/u;

function normalizeCode(value: string): string {
  return value.toUpperCase().replaceAll(/\s+/g, "").trim();
}

export default function SignUpPage() {
  const [inviteInputCode, setInviteInputCode] = useState("");
  const [referralInputCode, setReferralInputCode] = useState("");
  const [appliedInviteCode, setAppliedInviteCode] = useState("");
  const [appliedReferralCode, setAppliedReferralCode] = useState("");
  const [inviteCodeMessage, setInviteCodeMessage] = useState<string | null>(null);
  const [referralCodeMessage, setReferralCodeMessage] = useState<string | null>(null);

  const normalizedInviteInputCode = normalizeCode(inviteInputCode);
  const normalizedReferralInputCode = normalizeCode(referralInputCode);
  const isInviteCodeFormatValid =
    normalizedInviteInputCode.length === 0 || ALPHANUMERIC_HYPHEN_CODE_REGEX.test(normalizedInviteInputCode);
  const isReferralCodeFormatValid =
    normalizedReferralInputCode.length === 0 || ALPHANUMERIC_HYPHEN_CODE_REGEX.test(normalizedReferralInputCode);

  const redirectUrl = useMemo(() => {
    if (appliedInviteCode.length > 0 || appliedReferralCode.length > 0) {
      const params = new URLSearchParams();
      if (appliedInviteCode.length > 0) {
        params.set("inviteCode", appliedInviteCode);
      }
      if (appliedReferralCode.length > 0) {
        params.set("referralCode", appliedReferralCode);
      }
      return `/billing?${params.toString()}`;
    }
    return "/travel-assistant";
  }, [appliedInviteCode, appliedReferralCode]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-6 p-4">
      <section className="w-full max-w-md rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-600/50 dark:bg-emerald-950/40">
        <div>
          <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">Have an invite code?</h2>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">Enter a code from a friend or family member</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={inviteInputCode}
              onChange={(event) => setInviteInputCode(event.target.value)}
              placeholder="KEPI-FRIEND-ABC123"
              className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm uppercase tracking-wide text-slate-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => {
                if (!normalizedInviteInputCode) {
                  setAppliedInviteCode("");
                  setInviteCodeMessage("Invite Code cleared.");
                  return;
                }
                if (!ALPHANUMERIC_HYPHEN_CODE_REGEX.test(normalizedInviteInputCode)) {
                  setInviteCodeMessage("Invite Code format is invalid. Use letters, numbers, and hyphens only.");
                  return;
                }
                setAppliedInviteCode(normalizedInviteInputCode);
                setInviteCodeMessage("Invite Code saved. Continue sign-up to apply it automatically.");
              }}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              Save Invite Code
            </button>
          </div>
          {!isInviteCodeFormatValid ? (
            <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
              Invalid Invite Code format. Use letters, numbers, and hyphens only.
            </p>
          ) : null}
          {inviteCodeMessage ? <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">{inviteCodeMessage}</p> : null}
        </div>

        <div className="mt-5 border-t border-emerald-200 pt-4 dark:border-emerald-700/40">
          <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">Have a referral code?</h3>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">Enter a referral code to get 30 free days</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={referralInputCode}
              onChange={(event) => setReferralInputCode(event.target.value)}
              placeholder="ABCD1234"
              className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm uppercase tracking-wide text-slate-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => {
                if (!normalizedReferralInputCode) {
                  setAppliedReferralCode("");
                  setReferralCodeMessage("Referral Code cleared.");
                  return;
                }
                if (!ALPHANUMERIC_HYPHEN_CODE_REGEX.test(normalizedReferralInputCode)) {
                  setReferralCodeMessage("Referral Code format is invalid. Use letters, numbers, and hyphens only.");
                  return;
                }
                setAppliedReferralCode(normalizedReferralInputCode);
                setReferralCodeMessage("Referral Code saved. Continue sign-up to apply it automatically.");
              }}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              Save Referral Code
            </button>
          </div>
          {!isReferralCodeFormatValid ? (
            <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
              Invalid Referral Code format. Use letters, numbers, and hyphens only.
            </p>
          ) : null}
          {referralCodeMessage ? (
            <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">{referralCodeMessage}</p>
          ) : null}
        </div>
      </section>
      <div className="w-full max-w-md">
        <SignUp forceRedirectUrl={redirectUrl} signInForceRedirectUrl={redirectUrl} />
      </div>
    </main>
  );
}
