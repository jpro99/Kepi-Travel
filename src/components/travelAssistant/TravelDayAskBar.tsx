"use client";

import { useTravelAskChat } from "@/components/support/useTravelAskChat";
import { openSupportChat } from "@/components/support/SupportChat";

interface TravelDayAskBarProps {
  destination?: string | null;
}

const TRAVEL_DAY_PROMPTS = [
  "Will I make my connecting flight?",
  "My flight is delayed — what should I do?",
  "What are my EU passenger rights?",
] as const;

/**
 * G61 — Travel-day help must stay typeable on Home (not hidden behind coach cards or tab bar).
 */
export function TravelDayAskBar({ destination }: TravelDayAskBarProps) {
  const place = destination?.trim() || "your trip";
  const welcomeMessage = `Travel day help for ${place}. Ask about delays, connections, trains, or what to do next.`;

  const { messages, inputValue, setInputValue, isSending, error, sendMessage, scrollRef } =
    useTravelAskChat({ welcomeMessage });

  const hasThread = messages.length > 1;

  return (
    <section
      className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.08]"
      aria-label="Kepi Help"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#007AFF] dark:text-[#0A84FF]">
            Kepi Help
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
            Ask anything — delays, connections, what&apos;s next
          </h2>
        </div>
        <button
          type="button"
          onClick={() => openSupportChat()}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#007AFF] dark:border-slate-700"
        >
          Full chat
        </button>
      </div>

      {hasThread ? (
        <div
          ref={scrollRef}
          className="mt-3 max-h-[min(36vh,280px)] space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {messages
            .filter((message) => message.id !== "assistant-welcome")
            .map((message) => (
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
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {TRAVEL_DAY_PROMPTS.map((prompt) => (
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
      )}

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
            placeholder="Type your question…"
            enterKeyHint="send"
            autoComplete="off"
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
