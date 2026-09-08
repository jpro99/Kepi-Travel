"use client";

import { useMemo } from "react";
import { useTravelAskChat } from "@/components/support/useTravelAskChat";

interface TravelAskPanelProps {
  destination?: string | null;
  tripName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** Compact layout for Assist tab; embedded for More tab */
  variant?: "assist" | "embedded";
}

function buildClientTripContext(input: {
  destination?: string | null;
  tripName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): string {
  const lines = ["Traveler context (use for local recommendations):"];
  if (input.tripName?.trim()) lines.push(`- Trip: ${input.tripName.trim()}`);
  if (input.destination?.trim()) lines.push(`- Destination / region: ${input.destination.trim()}`);
  if (input.startDate?.trim() && input.endDate?.trim()) {
    lines.push(`- Dates: ${input.startDate.trim()} to ${input.endDate.trim()}`);
  }
  lines.push(
    "- The traveler may ask about walking tours, restaurants (including air conditioning), neighborhoods, and things to do near where they are now.",
  );
  return lines.join("\n");
}

function examplePrompts(destination: string | null | undefined): string[] {
  const place = destination?.trim() || "here";
  return [
    `Best walking tour in ${place}?`,
    `Restaurant with air conditioning near centro storico`,
    `What should we do this afternoon?`,
  ];
}

export function TravelAskPanel({
  destination,
  tripName,
  startDate,
  endDate,
  variant = "assist",
}: TravelAskPanelProps) {
  const tripContext = useMemo(
    () => buildClientTripContext({ destination, tripName, startDate, endDate }),
    [destination, tripName, startDate, endDate],
  );

  const welcomeMessage = destination?.trim()
    ? `You're traveling in ${destination.trim()}. Ask me about walking tours, restaurants, neighborhoods, or anything on this trip.`
    : "Ask me about walking tours, restaurants, neighborhoods, or anything on your trip.";

  const { messages, inputValue, setInputValue, isSending, error, sendMessage, scrollRef } =
    useTravelAskChat({ tripContext, welcomeMessage });

  const prompts = examplePrompts(destination);
  const isAssist = variant === "assist";

  return (
    <section
      className={
        isAssist
          ? "rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.08]"
          : "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#007AFF] dark:text-[#0A84FF]">
            Ask Kepi
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
            Local help &amp; trip questions
          </h2>
          {destination?.trim() ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Near {destination.trim()}</p>
          ) : null}
        </div>
        <span className="text-2xl shrink-0" aria-hidden>
          💬
        </span>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 max-h-[min(52vh,420px)] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-[17px] leading-snug ${
              message.role === "assistant"
                ? "mr-auto bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"
                : "ml-auto bg-[#007AFF] text-white"
            }`}
          >
            {message.content || (message.role === "assistant" ? "Thinking…" : "")}
          </article>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={isSending}
            onClick={() => {
              void sendMessage(prompt);
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 active:opacity-80 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {prompt}
          </button>
        ))}
      </div>

      <footer className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
        {error ? <p className="mb-2 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask about tours, restaurants, neighborhoods…"
            className="min-h-[48px] flex-1 rounded-2xl border border-slate-300 bg-white px-4 text-[17px] text-slate-900 outline-none ring-[#007AFF] focus-visible:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={isSending || !inputValue.trim()}
            onClick={() => {
              void sendMessage();
            }}
            className="min-h-[48px] shrink-0 rounded-2xl bg-[#007AFF] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSending ? "…" : "Send"}
          </button>
        </div>
      </footer>
    </section>
  );
}
