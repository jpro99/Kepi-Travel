export type SupportChatRole = "user" | "assistant";

export interface SupportChatTurn {
  role: SupportChatRole;
  content: string;
  id?: string;
}

const WELCOME_MESSAGE_ID = "assistant-welcome";

function stripWelcomeAndLeadingAssistant(
  turns: SupportChatTurn[],
): SupportChatTurn[] {
  const withoutWelcome = turns.filter(
    (turn) => turn.content.trim().length > 0 && turn.id !== WELCOME_MESSAGE_ID,
  );

  let normalized = withoutWelcome;
  while (normalized.length > 0 && normalized[0]!.role === "assistant") {
    normalized = normalized.slice(1);
  }
  return normalized;
}

function mergeConsecutiveRoles(
  turns: SupportChatTurn[],
): Array<{ role: SupportChatRole; content: string }> {
  const merged: Array<{ role: SupportChatRole; content: string }> = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n${turn.content.trim()}`;
      continue;
    }
    merged.push({ role: turn.role, content: turn.content.trim() });
  }
  return merged;
}

/**
 * Anthropic requires messages to start with a user turn and alternate roles.
 * Client UI keeps a local assistant welcome that must not be sent as the first turn.
 */
export function buildSupportChatApiMessages(
  history: SupportChatTurn[],
  outgoing: SupportChatTurn,
): Array<{ role: SupportChatRole; content: string }> {
  return mergeConsecutiveRoles(stripWelcomeAndLeadingAssistant([...history, outgoing]));
}

/** Server-side: normalize a full client-provided transcript. */
export function normalizeSupportChatApiMessages(
  history: SupportChatTurn[],
): Array<{ role: SupportChatRole; content: string }> {
  return mergeConsecutiveRoles(stripWelcomeAndLeadingAssistant(history));
}
