"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { isValidInviteCode, normalizeInviteCode } from "@/lib/invite/redeemInviteCodeClient";
import { authPathWithInviteCode, persistPendingInviteCode } from "@/lib/invite/pendingInviteCode";

function SignUpPageInner() {
  const searchParams = useSearchParams();
  const inviteCode = normalizeInviteCode(
    searchParams.get("code") ?? searchParams.get("inviteCode") ?? searchParams.get("redeem") ?? "",
  );
  const validInviteCode = isValidInviteCode(inviteCode) ? inviteCode : "";

  const redirectParam = searchParams.get("redirect_url")?.trim() ?? "";
  const safeRedirect =
    redirectParam.startsWith("/") && !redirectParam.startsWith("//") ? redirectParam : null;

  const forceRedirectUrl = validInviteCode
    ? `/travel-assistant?redeem=${encodeURIComponent(validInviteCode)}`
    : safeRedirect ?? "/travel-assistant";

  const signInUrl = authPathWithInviteCode("/sign-in", validInviteCode);

  useEffect(() => {
    if (validInviteCode) {
      persistPendingInviteCode(validInviteCode);
    }
  }, [validInviteCode]);

  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-[#f0f4f8] p-4 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-md py-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-[#0c2461] dark:text-white">Kepi Travel</h1>
          <p className="mt-1 text-sm text-slate-500">Create your account</p>
        </div>

        {validInviteCode ? (
          <div className="mb-4 rounded-2xl bg-gradient-to-r from-sky-600 to-sky-500 px-5 py-3 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-100">Invite code applied</p>
            <p className="font-mono text-lg font-black tracking-widest text-white">{validInviteCode}</p>
            <p className="mt-1 text-[11px] text-sky-100">
              Sign up with the same email this invite was sent to.
            </p>
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-4 shadow-lg dark:bg-slate-900">
          <SignUp
            forceRedirectUrl={forceRedirectUrl}
            signInUrl={signInUrl}
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none p-0",
              },
            }}
          />
        </div>

        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href={signInUrl} className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </main>
      }
    >
      <SignUpPageInner />
    </Suspense>
  );
}
