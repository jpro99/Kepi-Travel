import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function RedeemPage({ searchParams }: Props) {
  const { userId } = await auth();
  const { code } = await searchParams;

  // If not signed in, send to sign-up with code preserved
  if (!userId) {
    if (code) {
      redirect(`/sign-up?code=${encodeURIComponent(code)}`);
    }
    redirect("/sign-up");
  }

  // If signed in, redirect to travel assistant — onboarding will pick up the code
  if (!code) {
    redirect("/travel-assistant");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f0f4f8] px-4 dark:bg-slate-950">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-sky-500/10 dark:bg-slate-900">
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-[#0c2461] via-[#1a56b0] to-[#0ea5e9] px-8 py-8 text-center">
            <Logo size="sm" />
            <h1 className="mt-4 text-2xl font-bold text-white">You're invited to Kepi</h1>
            <p className="mt-2 text-sm text-sky-100">
              Your invite code is ready to redeem
            </p>
          </div>

          {/* Body */}
          <div className="px-8 py-8 space-y-6">
            {/* Code display */}
            <div className="rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50 p-5 text-center dark:border-sky-500/30 dark:bg-sky-500/10">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Your invite code</p>
              <p className="mt-2 font-mono text-2xl font-black tracking-widest text-sky-900 dark:text-sky-100">
                {code}
              </p>
            </div>

            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p className="flex items-start gap-2">
                <span className="text-base">✈️</span>
                Live flight tracking with automatic gate change alerts
              </p>
              <p className="flex items-start gap-2">
                <span className="text-base">🤖</span>
                AI guidance that tells you exactly what to do and when
              </p>
              <p className="flex items-start gap-2">
                <span className="text-base">👨‍👩‍👧</span>
                Real-time family location sharing on every trip
              </p>
            </div>

            {/* CTA - opens onboarding which redeems the code */}
            <Link
              href={`/travel-assistant?redeem=${encodeURIComponent(code)}`}
              className="block w-full rounded-2xl bg-sky-600 py-4 text-center text-sm font-bold text-white transition hover:bg-sky-500"
            >
              Activate my invite →
            </Link>

            <p className="text-center text-xs text-slate-400 dark:text-slate-500">
              This code is single-use and linked to your account once redeemed.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-sky-600 hover:underline dark:text-sky-400">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
