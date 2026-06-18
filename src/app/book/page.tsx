"use client";

import { Suspense } from "react";
import { CommandDeck } from "@/components/decision/CommandDeck";

function BookPageContent() {
  return <CommandDeck />;
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0b1f3a] text-sm font-semibold text-slate-300">
          Loading Trip Planner…
        </div>
      }
    >
      <BookPageContent />
    </Suspense>
  );
}
