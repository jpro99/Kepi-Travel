"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SSOCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f0f4f8] dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        <p className="text-sm text-slate-500">Finishing sign-up…</p>
        <AuthenticateWithRedirectCallback />
      </div>
    </main>
  );
}
