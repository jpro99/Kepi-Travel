"use client";

import { useMemo } from "react";
import { useTravelAskChat } from "@/components/support/useTravelAskChat";
import { openSupportChat } from "@/components/support/SupportChat";
import { formatClientSupportContext } from "@/lib/support/clientSupportContext";

interface TravelDayAskBarProps {
  destination?: string | null;
  airportIata?: string | null;
  connectionHeadline?: string | null;
}

const TRAVEL_DAY_PROMPTS = [
  "Will I make my connecting flight?",
  "My flight is delayed — what should I do?",
  "What are my EU passenger rights?",
] as const;

function buildTravelDayHelpContext(input: {
  destination?: string | null;
  airportIata?: string | null;
  connectionHeadline?: string | null;
}): string {
  const lines = [
    "Travel day help context (use for connections, gates, delays — NOT tourism):",
  ];
  const airport = input.airportIata?.trim().toUpperCase();
  if (airport) {
    lines.push(`- Traveler is at or heading to airport: ${airport}`);
    lines.push("- Prioritize gate, connection steps, and departure time — not restaurants or walking tours.");
  }
  if (input.connectionHeadline?.trim()) {
    lines.push(`- Current connection focus: ${input.connectionHeadline.trim()}`);
  }
  if (input.destination?.trim() && !airport) {
    lines.push(`- Trip region: ${input.destination.trim()}`);
  }
  lines.push(
    "- If the traveler says they already landed or are at the gate, believe them over stale journey phase.",
  );
  return lines.join("\n");
}

/**
 * G61 — Travel-day help must stay typeable on Home (not hidden behind coach cards or tab bar).
 * G65 — At an airport, never steer to Polignano tourism; connection + gate first.
 */
export function TravelDayAskBar({
  destination,
  airportIata,
  connectionHeadline,
}: TravelDayAskBarProps) {
  const airport = airportIata?.trim().toUpperCase() ?? null;
  const tripContext = useMemo(
    () =>
      [buildTravelDayHelpContext({ destination, airportIata, connectionHeadline }), formatClientSupportContext()]
        .filter(Boolean)
        .join("\n\n"),
    [destination, airportIata, connectionHeadline],
  );

  const welcomeMessage = airport
    ? `You're at ${airport}. Ask about your gate, connection, delays, or what to do in the next few minutes.`
    : destination?.trim()
      ? `Travel day help near ${destination.trim()}. Ask about delays, connections, trains, or what to do next.`
      : "Travel day help — ask about delays, connections, or what to do next.";

  const { messages, inputValue, setInputValue, isSending, error, sendMessage, scrollRef } =
    useTravelAskChat({ tripContext, welcomeMessage });

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
          {airport ? (
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              At {airport} airport
            </p>
          ) : null}
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

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Type your question…"
          disabled={isSending}
          className="min-h-[48px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-[17px] text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          autoComplete="off"
        />
        <button
          type="button"
          disabled={isSending || !inputValue.trim()}
          onClick={() => void sendMessage()}
          className="min-h-[48px] shrink-0 rounded-2xl bg-[#007AFF] px-4 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </section>
  );
}
