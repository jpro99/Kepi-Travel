"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildSupportChatApiMessages } from "@/lib/support/buildSupportChatApiMessages";
import { formatClientSupportContext } from "@/lib/support/clientSupportContext";

export type TravelAskRole = "user" | "assistant";

export interface TravelAskMessage {
  id: string;
  role: TravelAskRole;
  content: string;
}

interface UseTravelAskChatOptions {
  tripContext?: string;
  welcomeMessage?: string;
}

function nextMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_WELCOME =
  "Ask me anything about where you are — walking tours, restaurants, what to do today, or how to use Kepi on this trip.";

export function useTravelAskChat(options: UseTravelAskChatOptions = {}) {
  const welcomeMessage = options.welcomeMessage ?? DEFAULT_WELCOME;
  const tripContext = options.tripContext?.trim() ?? "";

  const [messages, setMessages] = useState<TravelAskMessage[]>([
    {
      id: "assistant-welcome",
      role: "assistant",
      content: welcomeMessage,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(
    async (overrideText?: string): Promise<void> => {
      const trimmed = (overrideText ?? inputValue).trim();
      if (!trimmed || isSending) {
        return;
      }

      const outgoingMessage: TravelAskMessage = {
        id: nextMessageId("user"),
        role: "user",
        content: trimmed,
      };
      const assistantPlaceholderId = nextMessageId("assistant");
      const assistantPlaceholder: TravelAskMessage = {
        id: assistantPlaceholderId,
        role: "assistant",
        content: "",
      };

      setError(null);
      setIsSending(true);
      setInputValue("");
      setMessages((previous) => [...previous, outgoingMessage, assistantPlaceholder]);

      const clientContext = formatClientSupportContext();
      const mergedContext = [tripContext, clientContext].filter(Boolean).join("\n\n");

      try {
        const response = await fetch("/api/support/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            messages: buildSupportChatApiMessages(messages, outgoingMessage),
            ...(mergedContext ? { tripContext: mergedContext } : {}),
          }),
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => ({ error: "" }))) as { error?: string };
          throw new Error(payload.error || `Ask Kepi failed (${response.status})`);
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
                      : "I can help with local tips and your trip. Could you add a little more detail?",
                }
              : message,
          ),
        );
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : "Ask Kepi failed.";
        setError(message);
        setMessages((previous) =>
          previous.map((entry) =>
            entry.id === assistantPlaceholderId
              ? {
                  ...entry,
                  content:
                    "I couldn’t answer that right now. Check your connection and try again in a moment.",
                }
              : entry,
          ),
        );
      } finally {
        setIsSending(false);
      }
    },
    [inputValue, isSending, messages, tripContext],
  );

  return {
    messages,
    inputValue,
    setInputValue,
    isSending,
    error,
    sendMessage,
    scrollRef,
  };
}
