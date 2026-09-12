"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/Logo";
import { buildSupportChatApiMessages } from "@/lib/support/buildSupportChatApiMessages";
import { formatClientSupportContext } from "@/lib/support/clientSupportContext";
import {
  buildTripHelpContextFromLiveStorage,
  tryAnswerTripQuestion,
} from "@/lib/support/tripHelpAnswer";
import { BugReportModal } from "@/components/support/BugReportModal";
import {
  AIRPORT_CONFIRM_SPOT_EVENT,
  AIRPORT_WALK_SHEET_EVENT,
} from "@/lib/airportNav/airportWalkSheet";
import {
  dispatchSupportChatClose,
  dispatchSupportChatOpen,
  SUPPORT_CHAT_OPEN_EVENT,
  SUPPORT_CHAT_Z_INDEX,
} from "@/lib/support/supportChatShell";

const PLAN_CITY_OPEN_EVENT = "kepi:plan-city-open";
const SUPPORT_QUICK_PROMPTS = [
  "Will I make my connecting flight?",
  "My flight is delayed — what should I do?",
  "Where am I?",
  "What time is my train?",
  "What's my next travel day?",
  "Plan a city day",
  "What are my EU passenger rights (EC 261)?",
] as const;
const BUG_REPORT_OPEN_EVENT = "kepi:bug-report-open";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

function nextMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function openSupportChat(): void {
  dispatchSupportChatOpen();
}

export function openPlanCityFromHelp(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PLAN_CITY_OPEN_EVENT));
}

export function openBugReport(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BUG_REPORT_OPEN_EVENT));
}

export function SupportChat() {
  const { isSignedIn } = useAuth();
  const t = useTranslations("SupportChat");
  const [isOpen, setIsOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [walkSheetOpen, setWalkSheetOpen] = useState(false);
  const [confirmSpotOpen, setConfirmSpotOpen] = useState(false);
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    setMessages([
      {
        id: "assistant-welcome",
        role: "assistant",
        content: t("welcome"),
      },
    ]);
  }, [t]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const onOpenRequested = (): void => {
      setUnreadCount(0);
      setIsOpen(true);
    };
    window.addEventListener(SUPPORT_CHAT_OPEN_EVENT, onOpenRequested);
    return () => {
      window.removeEventListener(SUPPORT_CHAT_OPEN_EVENT, onOpenRequested);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      dispatchSupportChatClose();
      return;
    }
    dispatchSupportChatOpen();
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 120);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    const onBugReport = (): void => setBugReportOpen(true);
    window.addEventListener(BUG_REPORT_OPEN_EVENT, onBugReport);
    return () => window.removeEventListener(BUG_REPORT_OPEN_EVENT, onBugReport);
  }, []);

  useEffect(() => {
    const onWalkSheet = (event: Event): void => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setWalkSheetOpen(Boolean(detail?.open));
    };
    const onConfirmSpot = (event: Event): void => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setConfirmSpotOpen(Boolean(detail?.open));
    };
    window.addEventListener(AIRPORT_WALK_SHEET_EVENT, onWalkSheet);
    window.addEventListener(AIRPORT_CONFIRM_SPOT_EVENT, onConfirmSpot);
    return () => {
      window.removeEventListener(AIRPORT_WALK_SHEET_EVENT, onWalkSheet);
      window.removeEventListener(AIRPORT_CONFIRM_SPOT_EVENT, onConfirmSpot);
    };
  }, []);

  useEffect(() => {
    const scroller = panelScrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, isOpen]);

  const bubbleLabel = useMemo(() => {
    if (unreadCount <= 0) {
      return t("bubbleLabel");
    }
    return t("bubbleLabelUnread", { count: unreadCount });
  }, [unreadCount, t]);

  const sendMessage = useCallback(async (textOverride?: string): Promise<void> => {
    const trimmed = (textOverride ?? inputValue).trim();
    if (!trimmed || isSending) {
      return;
    }

    const outgoingMessage: ChatMessage = {
      id: nextMessageId("user"),
      role: "user",
      content: trimmed,
    };
    const assistantPlaceholderId = nextMessageId("assistant");
    const assistantPlaceholder: ChatMessage = {
      id: assistantPlaceholderId,
      role: "assistant",
      content: "",
    };

    setError(null);
    setIsSending(true);
    setInputValue("");
    setMessages((previous) => [...previous, outgoingMessage, assistantPlaceholder]);

    const todayKey = new Date().toISOString().slice(0, 10);
    const helpContext =
      buildTripHelpContextFromLiveStorage({ todayKey }) ?? {
        todayKey,
        reservations: [],
      };
    const factualAnswer = tryAnswerTripQuestion(trimmed, helpContext);
    if (factualAnswer) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantPlaceholderId
            ? { ...message, content: factualAnswer }
            : message,
        ),
      );
      setIsSending(false);
      if (!isOpenRef.current) {
        setUnreadCount((count) => count + 1);
      }
      return;
    }

    const historyForApi = buildSupportChatApiMessages(messages, outgoingMessage);

    try {
      const clientContext = formatClientSupportContext();
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: historyForApi,
          ...(clientContext ? { tripContext: clientContext } : {}),
        }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({ error: "" }))) as { error?: string };
        throw new Error(payload.error || `Support chat failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let finalAssistantText = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        finalAssistantText += decoder.decode(value, { stream: true });
        const partial = finalAssistantText;
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantPlaceholderId ? { ...message, content: partial } : message,
          ),
        );
      }
      finalAssistantText += decoder.decode();
      const completed = finalAssistantText.trim();
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantPlaceholderId
            ? {
                ...message,
                content:
                  completed.length > 0
                    ? completed
                    : t("emptyFallback"),
              }
            : message,
        ),
      );
      if (!isOpenRef.current) {
        setUnreadCount((count) => count + 1);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Support chat failed.";
      setError(message);
      setMessages((previous) =>
        previous.map((entry) =>
          entry.id === assistantPlaceholderId
            ? {
                ...entry,
                content: t("errorFallback"),
              }
            : entry,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }, [inputValue, isSending, messages, t]);

  if (!isSignedIn) {
    return null;
  }

  return (
    <>
      <BugReportModal open={bugReportOpen} onClose={() => setBugReportOpen(false)} />

      {isOpen ? (
        <section
          className="fixed inset-0 flex h-[100dvh] max-h-[100dvh] flex-col bg-slate-950 sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[480px] sm:max-h-[min(90dvh,640px)] sm:w-[min(100vw-2rem,380px)] sm:rounded-2xl sm:border sm:border-slate-700 sm:bg-slate-950/95"
          style={{ zIndex: SUPPORT_CHAT_Z_INDEX }}
        >
          <div className="flex h-full min-h-0 w-full flex-col">
            <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <Logo size="sm" className="[&>span:last-child]:text-slate-100" />
                <p className="sr-only">Kepi Support</p>
                <p className="text-[11px] text-slate-400">{t("subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  dispatchSupportChatClose();
                }}
                className="min-h-[44px] rounded-md border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                {t("close")}
              </button>
            </header>

            <div
              ref={panelScrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {messages.length <= 1 ? (
                <div className="flex flex-wrap gap-2">
                  {SUPPORT_QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        if (prompt === "Plan a city day") {
                          setIsOpen(false);
                          openPlanCityFromHelp();
                          return;
                        }
                        void sendMessage(prompt);
                      }}
                      disabled={isSending}
                      className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[92%] rounded-xl px-3 py-2 ${
                    message.role === "assistant"
                      ? "mr-auto bg-slate-800 text-slate-100"
                      : "ml-auto bg-cyan-500 text-slate-950"
                  }`}
                >
                  {message.content || (message.role === "assistant" ? t("thinking") : "")}
                </article>
              ))}
            </div>

            <footer
              className="shrink-0 border-t border-slate-700 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              {error ? <p className="mb-2 text-xs text-rose-300">{error}</p> : null}
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={t("inputPlaceholder")}
                  enterKeyHint="send"
                  autoComplete="off"
                  className="min-h-[48px] flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-[17px] text-slate-100 outline-none ring-cyan-300 focus-visible:ring-2"
                />
                <button
                  type="button"
                  disabled={isSending || !inputValue.trim()}
                  onClick={() => {
                    void sendMessage();
                  }}
                  className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? t("sending") : t("send")}
                </button>
              </div>
              {/* Bug report quick-access */}
              <button
                type="button"
                onClick={() => { setIsOpen(false); setBugReportOpen(true); }}
                className="mt-2 w-full rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                🐛 Report a bug or crash
              </button>
            </footer>
          </div>
        </section>
      ) : null}

      {!walkSheetOpen && !confirmSpotOpen ? (
      <button
        type="button"
        aria-label={bubbleLabel}
        onClick={() => {
          setUnreadCount(0);
          setIsOpen(true);
        }}
        className="fixed right-4 z-[110] kepi-fixed-above-tab-bar inline-flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-400 md:right-6"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 6.5C4 5.12 5.12 4 6.5 4h11C18.88 4 20 5.12 20 6.5v7c0 1.38-1.12 2.5-2.5 2.5H10l-4.2 3.6c-.66.56-1.8.1-1.8-.77V6.5Z" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      ) : null}
    </>
  );
}
