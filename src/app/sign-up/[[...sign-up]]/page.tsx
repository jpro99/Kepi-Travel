"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import Link from "next/link";

const CODE_REGEX = /^[A-Z0-9-]{1,50}$/u;

function SignUpPageInner() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const searchParams = useSearchParams();
  const router = useRouter();

  const codeFromUrl = (
    searchParams.get("code") ??
    searchParams.get("inviteCode") ??
    searchParams.get("redeem") ??
    ""
  ).toUpperCase();

  const [step, setStep] = useState<"form" | "verify">("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(codeFromUrl);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectUrl = inviteCode
    ? `/travel-assistant?redeem=${encodeURIComponent(inviteCode)}`
    : "/travel-assistant";

  const handleSignUp = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signUp.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err: unknown) {
      const msg = (err as { errors?: Array<{ message: string }> })?.errors?.[0]?.message
        ?? "Sign up failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: verificationCode });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: unknown) {
      const msg = (err as { errors?: Array<{ message: string }> })?.errors?.[0]?.message
        ?? "Verification failed. Check the code and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-[#f0f4f8] dark:bg-slate-950">
      <div className="w-full max-w-md">
        {/* Logo / header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-[#0c2461] dark:text-white">Kepi Travel</h1>
          <p className="mt-1 text-sm text-slate-500">Create your account</p>
        </div>

        <div className="rounded-2xl bg-white shadow-lg dark:bg-slate-900 overflow-hidden">
          {/* Invite code banner */}
          {inviteCode && (
            <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-5 py-3 flex items-center gap-2">
              <span className="text-lg">🎟</span>
              <div>
                <p className="text-xs font-bold text-sky-100 uppercase tracking-wider">Invite code applied</p>
                <p className="font-mono font-black text-white tracking-widest">{inviteCode}</p>
              </div>
            </div>
          )}

          <div className="p-6 space-y-4">
            {step === "form" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">First name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="Jeff"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Last name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Russell"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    autoComplete="new-password"
                  />
                </div>

                {!inviteCode && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Invite code <span className="font-normal text-slate-400">(optional)</span></label>
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={e => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="KEPI-XXXX"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 font-mono text-sm uppercase tracking-widest dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                )}

                {error && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
                )}

                <button
                  type="button"
                  onClick={() => void handleSignUp()}
                  disabled={loading || !email || !password}
                  className="w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-sky-500 transition"
                >
                  {loading ? "Creating account..." : "Create account →"}
                </button>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Already have an account?{" "}
                  <Link href="/sign-in" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
                    Sign in
                  </Link>
                </p>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="text-4xl mb-3">📧</div>
                  <h2 className="font-bold text-slate-900 dark:text-white">Check your email</h2>
                  <p className="mt-1 text-sm text-slate-500">We sent a 6-digit code to <strong>{email}</strong></p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    autoComplete="one-time-code"
                  />
                </div>

                {error && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
                )}

                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={loading || verificationCode.length < 6}
                  className="w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-sky-500 transition"
                >
                  {loading ? "Verifying..." : "Verify & sign in →"}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep("form"); setError(null); }}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                  ← Back
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
      </main>
    }>
      <SignUpPageInner />
    </Suspense>
  );
}
