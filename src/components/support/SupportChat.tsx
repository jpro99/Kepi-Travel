"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/Logo";
import { buildSupportChatApiMessages } from "@/lib/support/buildSupportChatApiMessages";
import { formatClientSupportContext } from "@/lib/support/clientSupportContext";
import { readTicketScanResponse } from "@/lib/travelAssistant/confirmationScanClient";
import { isConfirmationScanUpload } from "@/lib/travelAssistant/scannedReservationDraft";
import { dispatchSupportTicketScan } from "@/lib/support/supportChatEvents";
import { useMobileChatViewport } from "@/lib/support/useMobileChatViewport";
import { BugReportModal } from "@/components/support/BugReportModal";
import {
  AIRPORT_CONFIRM_SPOT_EVENT,
  AIRPORT_WALK_SHEET_EVENT,
} from "@/lib/airportNav/airportWalkSheet";

const SUPPORT_OPEN_EVENT = "kepi:support-open";
const SUPPORT_PANEL_Z = "z-[100010]";
const SUPPORT_QUICK_PROMPTS = [
  "My flight changed — help me update my trip",
  "We're on standby — what are our rights?",
  "Where do I claim my bags?",
  "How do I get to my train?",
  "Help with my connection",
] as const;
const BUG_REPORT_OPEN_EVENT = "kepi:bug-report-open";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  imagePreviewUrl?: string;
  scanApplyLabel?: string;
}

function nextMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeScanDraft(draft: Record<string, unknown>): string {
  const flight = String(draft.flightNumber ?? "").trim();
  const from = String(draft.flightDepartureAirport ?? "").trim().toUpperCase();
  const to = String(draft.flightArrivalAirport ?? "").trim().toUpperCase();
  const when = String(draft.flightDepartureTime ?? draft.localTime ?? "").trim();
  const airline = String(draft.flightAirline ?? draft.provider ?? "").trim();
  const parts = [
    flight ? `Flight ${flight}` : null,
    airline || null,
    from && to ? `${from} → ${to}` : draft.location ? String(draft.location) : null,
    when || null,
    draft.confirmationCode ? `Confirmation ${String(draft.confirmationCode)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Booking details found in your photo.";
}

export function openSupportChat(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SUPPORT_OPEN_EVENT));
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
  const [isScanning, setIsScanning] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingScanFile, setPendingScanFile] = useState<File | null>(null);
  const [walkSheetOpen, setWalkSheetOpen] = useState(false);
  const [confirmSpotOpen, setConfirmSpotOpen] = useState(false);
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isOpenRef = useRef(isOpen);
  const { keyboardInsetPx, viewportHeightPx, viewportOffsetTopPx } = useMobileChatViewport(isOpen);

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
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(focusTimer);
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

  const sendMessage = useCallback(
    async (textOverride?: string): Promise<void> => {
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
                  content: completed.length > 0 ? completed : t("emptyFallback"),
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
        window.setTimeout(() => {
          inputRef.current?.focus({ preventScroll: true });
        }, 80);
      }
    },
    [inputValue, isSending, messages, t],
  );

  const applyPendingScan = useCallback((): void => {
    if (!pendingScanFile) return;
    dispatchSupportTicketScan(pendingScanFile);
    setPendingScanFile(null);
    setMessages((previous) => [
      ...previous,
      {
        id: nextMessageId("assistant"),
        role: "assistant",
        content: t("scanApplied"),
      },
    ]);
  }, [pendingScanFile, t]);

  const handleAttachment = useCallback(
    async (file: File): Promise<void> => {
      if (isScanning || isSending) return;
      setError(null);

      if (!isConfirmationScanUpload(file) && !file.type.startsWith("image/")) {
        setError(t("attachErrorType"));
        return;
      }

      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      const readingId = nextMessageId("assistant-reading");
      setMessages((previous) => [
        ...previous,
        {
          id: nextMessageId("user"),
          role: "user",
          content: t("attachSent", { name: file.name || "photo" }),
          imagePreviewUrl: previewUrl,
        },
        {
          id: readingId,
          role: "assistant",
          content: t("scanReading"),
        },
      ]);

      setIsScanning(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/travel-updates/ticket-scan", {
          method: "POST",
          body: formData,
          cache: "no-store",
          credentials: "include",
        });
        const { ok, payload } = await readTicketScanResponse(response);
        const drafts =
          payload.drafts && payload.drafts.length > 0
            ? payload.drafts
            : payload.draft
              ? [payload.draft]
              : [];

        if (!ok || drafts.length === 0) {
          throw new Error(payload.error ?? t("scanFailed"));
        }

        const summary = summarizeScanDraft(drafts[0] as Record<string, unknown>);
        setPendingScanFile(file);
        setMessages((previous) => {
          const withoutReading = previous.filter((entry) => entry.id !== readingId);
          return [
            ...withoutReading,
            {
              id: nextMessageId("assistant"),
              role: "assistant",
              content: t("scanFound", { summary }),
              scanApplyLabel: t("scanApplyCta"),
            },
          ];
        });
      } catch (scanError) {
        const message = scanError instanceof Error ? scanError.message : t("scanFailed");
        setError(message);
        setMessages((previous) => {
          const withoutReading = previous.filter((entry) => entry.id !== readingId);
          return [
            ...withoutReading,
            {
              id: nextMessageId("assistant"),
              role: "assistant",
              content: t("scanFailedHelp", { error: message }),
            },
          ];
        });
      } finally {
        setIsScanning(false);
        window.setTimeout(() => {
          inputRef.current?.focus({ preventScroll: true });
        }, 80);
      }
    },
    [isScanning, isSending, t],
  );

  if (!isSignedIn) {
    return null;
  }

  const shellStyle =
    viewportHeightPx != null
      ? {
          height: `${viewportHeightPx}px`,
          maxHeight: `${viewportHeightPx}px`,
          top: `${viewportOffsetTopPx}px`,
          bottom: "auto" as const,
        }
      : {
          height: "100dvh",
          maxHeight: "100dvh",
        };

  const footerPadBottom = `max(${keyboardInsetPx}px, env(safe-area-inset-bottom, 0px))`;

  return (
    <>
      <BugReportModal open={bugReportOpen} onClose={() => setBugReportOpen(false)} />

      {isOpen ? (
        <section
          className={`fixed inset-x-0 ${SUPPORT_PANEL_Z} grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-slate-950 sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(560px,90dvh)] sm:w-[min(400px,calc(100vw-2rem))] sm:rounded-2xl sm:border sm:border-slate-700`}
          style={{
            ...shellStyle,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
          aria-label="Kepi Support chat"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
            <div>
              <Logo size="sm" className="[&>span:last-child]:text-slate-100" />
              <p className="sr-only">Kepi Support</p>
              <p className="text-[11px] text-slate-400">{t("subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              {t("close")}
            </button>
          </header>

          <div
            ref={panelScrollRef}
            className="min-h-0 space-y-3 overflow-y-auto overscroll-y-contain px-3 py-3 text-sm [-webkit-overflow-scrolling:touch]"
          >
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[92%] rounded-xl px-3 py-2 ${
                  message.role === "assistant"
                    ? "mr-auto bg-slate-800 text-slate-100"
                    : "ml-auto bg-cyan-500 text-slate-950"
                }`}
              >
                {message.imagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={message.imagePreviewUrl}
                    alt=""
                    className="mb-2 max-h-32 rounded-lg border border-white/20 object-cover"
                  />
                ) : null}
                <p className="whitespace-pre-wrap break-words">
                  {message.content || (message.role === "assistant" ? t("thinking") : "")}
                </p>
                {message.scanApplyLabel && pendingScanFile ? (
                  <button
                    type="button"
                    onClick={applyPendingScan}
                    className="mt-2 min-h-[44px] rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    {message.scanApplyLabel}
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          <footer
            className="z-10 shrink-0 border-t border-slate-700 bg-slate-950 px-3 pt-3"
            style={{ paddingBottom: footerPadBottom }}
          >
            {messages.length <= 1 ? (
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                {SUPPORT_QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isSending || isScanning}
                    onClick={() => {
                      void sendMessage(prompt);
                    }}
                    className="shrink-0 rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
            {error ? <p className="mb-2 text-xs text-rose-300">{error}</p> : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void handleAttachment(file);
              }}
            />
            <div className="flex items-end gap-2">
              <button
                type="button"
                disabled={isSending || isScanning}
                onClick={() => fileInputRef.current?.click()}
                aria-label={t("attachPhoto")}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 text-lg text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                📷
              </button>
              <textarea
                ref={inputRef}
                rows={2}
                enterKeyHint="send"
                autoComplete="off"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={t("inputPlaceholder")}
                className="max-h-28 min-h-[48px] flex-1 resize-none rounded-lg border border-slate-500 bg-slate-900 px-3 py-2 text-base leading-snug text-slate-100 outline-none ring-cyan-300 placeholder:text-slate-400 focus-visible:ring-2"
              />
              <button
                type="button"
                disabled={isSending || isScanning || !inputValue.trim()}
                onClick={() => {
                  void sendMessage();
                }}
                className="min-h-[48px] shrink-0 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? t("sending") : t("send")}
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setBugReportOpen(true);
                }}
                className="min-h-[40px] flex-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                {t("reportProblem")}
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      {!isOpen && !walkSheetOpen && !confirmSpotOpen ? (
        <button
          type="button"
          aria-label={bubbleLabel}
          onClick={() => {
            setUnreadCount(0);
            setIsOpen(true);
          }}
          className="fixed right-4 z-[100005] kepi-fixed-above-tab-bar inline-flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-400 md:right-6"
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
