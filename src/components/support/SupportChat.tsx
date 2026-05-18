"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SUPPORT_OPEN_EVENT = "kepi:support-chat-open";

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
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(SUPPORT_OPEN_EVENT));
}

export function SupportChat() {
  const { isSignedIn } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "assistant-welcome",
      role: "assistant",
      content:
        "Hi! I’m Kepi Support. I can help with trips, reservations, billing, notifications, and app workflows.",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const onOpenRequested = (): void => {
      setUnreadCount(0);
      setIsOpen(true);
    };
    window.addEventListener(SUPPORT_OPEN_EVENT, onOpenRequested);
    return () => {
      window.removeEventListener(SUPPORT_OPEN_EVENT, onOpenRequested);
    };
  }, []);

  useEffect(() => {
    const scroller = panelScrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, isOpen]);

  const bubbleLabel = useMemo(() => {
    if (unreadCount <= 0) {
      return "Support chat";
    }
    return `Support chat (${unreadCount} unread)`;
  }, [unreadCount]);

  const sendMessage = useCallback(async (): Promise<void> => {
    const trimmed = inputValue.trim();
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

    const historyForApi = [...messages, outgoingMessage].map((message) => ({
      role: message.role,
      content: message.content,
    }));

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi }),
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
                    : "I can help with Kepi support topics. Could you provide a little more detail?",
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
                content:
                  "I couldn’t complete that response right now. Please try again, or contact human support.",
              }
            : entry,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }, [inputValue, isSending, messages]);

  if (!isSignedIn) {
    return null;
  }

  return (
    <>
      {isOpen ? (
        <section className="fixed inset-0 z-[120] flex bg-slate-950/75 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[480px] sm:w-[320px] sm:rounded-2xl sm:border sm:border-slate-700 sm:bg-slate-950/95">
          <div className="flex h-full w-full flex-col">
            <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Kepi Support</p>
                <p className="text-[11px] text-slate-400">Fast help for trips, billing, and app workflows</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </header>

            <div ref={panelScrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[92%] rounded-xl px-3 py-2 ${
                    message.role === "assistant"
                      ? "mr-auto bg-slate-800 text-slate-100"
                      : "ml-auto bg-cyan-500 text-slate-950"
                  }`}
                >
                  {message.content || (message.role === "assistant" ? "Thinking..." : "")}
                </article>
              ))}
            </div>

            <footer className="border-t border-slate-700 px-3 py-3">
              {error ? <p className="mb-2 text-xs text-rose-300">{error}</p> : null}
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
                  placeholder="Ask Kepi support..."
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-300 focus-visible:ring-2"
                />
                <button
                  type="button"
                  disabled={isSending || !inputValue.trim()}
                  onClick={() => {
                    void sendMessage();
                  }}
                  className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>
            </footer>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        aria-label={bubbleLabel}
        onClick={() => {
          setUnreadCount(0);
          setIsOpen(true);
        }}
        className="fixed bottom-6 right-6 z-[110] inline-flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-400"
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
    </>
  );
}
