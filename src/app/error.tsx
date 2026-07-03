"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const errorMessage = typeof error?.message === "string" && error.message.length > 0 ? error.message : "Unknown error";
  const errorStack = typeof error?.stack === "string" && error.stack.length > 0 ? error.stack : "Stack unavailable";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-4 py-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-slate-600">
        We&apos;ve recorded this error and are looking into it. Please try again.
      </p>
      <section className="w-full rounded-lg border border-red-200 bg-red-50 p-4 text-left text-xs text-red-900">
        <p className="font-semibold">Error message</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">{errorMessage}</pre>
        {error?.digest && (
          <>
            <p className="mt-3 font-semibold">Error digest (send this to support)</p>
            <pre className="mt-2 font-mono text-sm font-bold">{error.digest}</pre>
          </>
        )}
        <p className="mt-3 font-semibold">Error stack</p>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words">{errorStack}</pre>
      </section>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Try again
      </button>
    </main>
  );
}
