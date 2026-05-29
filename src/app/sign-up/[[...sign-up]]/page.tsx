"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import Link from "next/link";

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
  const [oauthLoading, setOauthLoading] = useState(false);

  const redirectUrl = inviteCode
    ? `/travel-assistant?redeem=${encodeURIComponent(inviteCode)}`
    : "/travel-assistant";

  // Google OAuth — preserves invite code in the redirect URL
  const handleGoogleSignUp = async () => {
    if (!isLoaded || oauthLoading) return;
    setOauthLoading(true);
    setError(null);
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: redirectUrl,
      });
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message: string }> })?.errors?.[0]?.message ??
        "Google sign-up failed. Please try again.";
      setError(msg);
      setOauthLoading(false);
    }
  };

  const handleSignUp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isLoaded || loading) return;
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!password) { setError("Please enter a password."); return; }
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
      const msg =
        (err as { errors?: Array<{ message: string }> })?.errors?.[0]?.message ??
        "Sign up failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isLoaded || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message: string }> })?.errors?.[0]?.message ??
        "Verification failed. Check the code and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-[#f0f4f8] dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-[#0c2461] dark:text-white">Kepi Travel</h1>
          <p className="mt-1 text-sm text-slate-500">Create your account</p>
        </div>

        <div className="rounded-2xl bg-white shadow-lg dark:bg-slate-900 overflow-hidden">
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
                {/* Google OAuth — always shown, preserves invite code */}
                <button
                  type="button"
                  onClick={() => void handleGoogleSignUp()}
                  disabled={oauthLoading || loading}
                  className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 transition dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                >
                  {oauthLoading ? (
                    <span className="h-4 w-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  {oauthLoading ? "Connecting…" : "Continue with Google"}
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  <span className="text-xs text-slate-400">or</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>

                <form
                  action="#"
                  onSubmit={(e) => void handleSignUp(e)}
                  noValidate
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="su-first" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        First name
                      </label>
                      <input
                        id="su-first"
                        type="text"
                        name="given-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Jeff"
                        autoComplete="given-name"
                        autoCapitalize="words"
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="su-last" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Last name
                      </label>
                      <input
                        id="su-last"
                        type="text"
                        name="family-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Russell"
                        autoComplete="family-name"
                        autoCapitalize="words"
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="su-email" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Email
                    </label>
                    <input
                      id="su-email"
                      type="email"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="email"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="su-password" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Password
                    </label>
                    <input
                      id="su-password"
                      type="password"
                      name="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  {!codeFromUrl && (
                    <div>
                      <label htmlFor="su-code" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Invite code <span className="font-normal text-slate-400">(optional)</span>
                      </label>
                      <input
                        id="su-code"
                        type="text"
                        name="invite-code"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="KEPI-XXXX"
                        autoComplete="off"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 font-mono text-sm uppercase tracking-widest dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  )}

                  {error && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-sky-500 transition"
                  >
                    {loading ? "Creating account…" : "Create account →"}
                  </button>
                </form>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Already have an account?{" "}
                  <Link href="/sign-in" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
                    Sign in
                  </Link>
                </p>
              </>
            ) : (
              <form
                action="#"
                onSubmit={(e) => void handleVerify(e)}
                noValidate
                className="space-y-4"
              >
                <div className="text-center">
                  <div className="text-4xl mb-3">📧</div>
                  <h2 className="font-bold text-slate-900 dark:text-white">Check your email</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    We sent a 6-digit code to <strong>{email}</strong>
                  </p>
                </div>

                <div>
                  <label htmlFor="su-otp" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Verification code
                  </label>
                  <input
                    id="su-otp"
                    type="text"
                    name="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={verificationCode}
                    onChange={(e) =>
                      setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="123456"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="none"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                {error && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || verificationCode.length < 6}
                  className="w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-sky-500 transition"
                >
                  {loading ? "Verifying…" : "Verify & sign in →"}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep("form"); setError(null); }}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                  ← Back
                </button>
              </form>
            )}
          </div>
        </div>
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
