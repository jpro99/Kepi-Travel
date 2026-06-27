import {
  BOT_DECK_BOTS,
  DEFAULT_BOT_MEMORY,
  DEFAULT_PROJECT_MEMORY,
  type BotDeckBotId,
  type BotDeckMessage,
  type BotDeckTask,
} from "@/lib/admin/botDeck/types";
import { generateId } from "@/lib/utils/generateId";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

/** Global namespace — not per end-user. */
const BOT_DECK_NS = "kepi-bot-deck-global";

const TASKS_KEY = "bot-deck-tasks";
const MESSAGES_KEY = "bot-deck-messages";
const PROJECT_MEMORY_KEY = "bot-deck-project-memory";

function memoryKey(botId: BotDeckBotId): string {
  return `bot-deck-memory-${botId}`;
}

const kvOpts = { userId: BOT_DECK_NS };

export async function listBotDeckTasks(): Promise<BotDeckTask[]> {
  const tasks = await kvStoreGet<BotDeckTask[]>(TASKS_KEY, kvOpts);
  return Array.isArray(tasks) ? tasks : [];
}

export async function saveBotDeckTasks(tasks: BotDeckTask[]): Promise<void> {
  await kvStoreSet(TASKS_KEY, tasks.slice(0, 200), kvOpts);
}

export async function listBotDeckMessages(): Promise<BotDeckMessage[]> {
  const messages = await kvStoreGet<BotDeckMessage[]>(MESSAGES_KEY, kvOpts);
  return Array.isArray(messages) ? messages : [];
}

export async function saveBotDeckMessages(messages: BotDeckMessage[]): Promise<void> {
  await kvStoreSet(MESSAGES_KEY, messages.slice(0, 500), kvOpts);
}

export async function getBotMemory(botId: BotDeckBotId): Promise<string> {
  const stored = await kvStoreGet<string>(memoryKey(botId), kvOpts);
  if (typeof stored === "string" && stored.trim()) return stored;
  return DEFAULT_BOT_MEMORY[botId];
}

export async function setBotMemory(botId: BotDeckBotId, content: string): Promise<void> {
  await kvStoreSet(memoryKey(botId), content.trim() + "\n", kvOpts);
}

export async function appendBotMemory(botId: BotDeckBotId, note: string): Promise<void> {
  const existing = await getBotMemory(botId);
  const block = `\n\n## ${new Date().toISOString()}\n${note.trim()}\n`;
  await setBotMemory(botId, existing + block);
}

export async function getProjectMemory(): Promise<string> {
  const stored = await kvStoreGet<string>(PROJECT_MEMORY_KEY, kvOpts);
  if (typeof stored === "string" && stored.trim()) return stored;
  return DEFAULT_PROJECT_MEMORY;
}

export async function setProjectMemory(content: string): Promise<void> {
  await kvStoreSet(PROJECT_MEMORY_KEY, content.trim() + "\n", kvOpts);
}

export async function buildBotDeckOverview() {
  const tasks = await listBotDeckTasks();
  return Promise.all(
    BOT_DECK_BOTS.map(async (bot) => {
      const memory = await getBotMemory(bot.id);
      const activeTasks = tasks.filter((t) => t.assignee === bot.id && t.status === "in_progress");
      const queuedCount = tasks.filter((t) => t.assignee === bot.id && t.status === "pending").length;
      return {
        ...bot,
        memoryPreview: memory.split("\n").slice(0, 8).join("\n"),
        memoryChars: memory.length,
        activeTasks,
        queuedCount,
      };
    }),
  );
}

export async function createBotDeckTask(input: {
  assignee: BotDeckBotId;
  instruction: string;
  creditNote?: string;
  from?: string;
  status?: BotDeckTask["status"];
}): Promise<BotDeckTask> {
  const now = new Date().toISOString();
  const task: BotDeckTask = {
    id: generateId(),
    assignee: input.assignee,
    instruction: input.instruction.trim(),
    status: input.status ?? "pending",
    priority: "normal",
    creditNote: input.creditNote?.trim() ?? "",
    from: input.from ?? "jeff",
    createdAt: now,
    updatedAt: now,
  };

  const tasks = await listBotDeckTasks();
  tasks.unshift(task);
  await saveBotDeckTasks(tasks);

  const messages = await listBotDeckMessages();
  messages.unshift({
    id: generateId(),
    from: task.from,
    to: task.assignee,
    text: task.instruction,
    taskId: task.id,
    at: now,
  });
  await saveBotDeckMessages(messages);

  await appendBotMemory(task.assignee, `**Task assigned:** ${task.instruction}`);
  if (task.assignee !== "conductor") {
    await appendBotMemory("conductor", `Assigned to **${task.assignee}:** ${task.instruction}`);
  }

  return task;
}

export async function updateBotDeckTask(
  taskId: string,
  patch: Partial<Pick<BotDeckTask, "status" | "priority" | "creditNote">>,
): Promise<BotDeckTask | null> {
  const tasks = await listBotDeckTasks();
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index < 0) return null;
  tasks[index] = { ...tasks[index], ...patch, updatedAt: new Date().toISOString() };
  await saveBotDeckTasks(tasks);
  return tasks[index];
}

export function cursorPromptForTask(assignee: BotDeckBotId, instruction: string): string {
  const bot = BOT_DECK_BOTS.find((b) => b.id === assignee);
  return `Follow ${bot?.skill ?? assignee}: ${instruction}`;
}
