"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BOT_DECK_BOTS, type BotDeckBotId, type BotDeckMessage, type BotDeckTask } from "@/lib/admin/botDeck/types";

type Tab = "dashboard" | "instruct" | "tasks" | "messages" | "memory";

interface BotOverview {
  id: BotDeckBotId;
  name: string;
  emoji: string;
  role: string;
  skill: string;
  memoryChars: number;
  queuedCount: number;
  activeTasks: BotDeckTask[];
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", credentials: "include" });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data;
}

function botLabel(id: string): string {
  const bot = BOT_DECK_BOTS.find((b) => b.id === id);
  return bot ? `${bot.emoji} ${bot.name}` : id;
}

export function AdminBotDeckClient() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [bots, setBots] = useState<BotOverview[]>([]);
  const [tasks, setTasks] = useState<BotDeckTask[]>([]);
  const [messages, setMessages] = useState<BotDeckMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [instructBot, setInstructBot] = useState<BotDeckBotId>("conductor");
  const [instructText, setInstructText] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [cursorPrompt, setCursorPrompt] = useState<string | null>(null);

  const [memoryBot, setMemoryBot] = useState<BotDeckBotId>("conductor");
  const [memoryEditor, setMemoryEditor] = useState("");
  const [projectMemory, setProjectMemory] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [botsRes, tasksRes, messagesRes, memRes, projRes] = await Promise.all([
        adminFetch<{ bots: BotOverview[] }>("/api/admin/bots"),
        adminFetch<{ tasks: BotDeckTask[] }>("/api/admin/bots/tasks"),
        adminFetch<{ messages: BotDeckMessage[] }>("/api/admin/bots/messages"),
        adminFetch<{ memory: string }>(`/api/admin/bots/memory/${memoryBot}`),
        adminFetch<{ content: string }>("/api/admin/bots/project-memory"),
      ]);
      setBots(botsRes.bots);
      setTasks(tasksRes.tasks);
      setMessages(messagesRes.messages);
      setMemoryEditor(memRes.memory);
      setProjectMemory(projRes.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Bot Deck");
    } finally {
      setLoading(false);
    }
  }, [memoryBot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitInstruct = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!instructText.trim()) return;
    const result = await adminFetch<{ cursorPrompt: string }>("/api/admin/bots/instruct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot: instructBot, instruction: instructText, creditNote }),
    });
    setCursorPrompt(result.cursorPrompt);
    setInstructText("");
    setCreditNote("");
    await refresh();
    setTab("tasks");
  };

  const patchTask = async (taskId: string, status: BotDeckTask["status"]): Promise<void> => {
    await adminFetch(`/api/admin/bots/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refresh();
  };

  const saveMemory = async (): Promise<void> => {
    await adminFetch(`/api/admin/bots/memory/${memoryBot}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: memoryEditor }),
    });
    await refresh();
  };

  const saveProjectMemory = async (): Promise<void> => {
    await adminFetch("/api/admin/bots/project-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: projectMemory }),
    });
    await refresh();
  };

  const copyPrompt = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Admin-only bot control — works on your phone anywhere. Paste prompts in Cursor when ready (no auto-spend).
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-600"
          >
            Refresh
          </button>
          <Link
            href="/admin"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-600"
          >
            ← Admin
          </Link>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["dashboard", "Bots"],
            ["instruct", "Instruct"],
            ["tasks", "Tasks"],
            ["messages", "Messages"],
            ["memory", "Memory"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === id
                ? "bg-sky-600 text-white"
                : "border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading && tab === "dashboard" ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : null}

      {tab === "dashboard" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {bots.map((bot) => {
            const busy = bot.activeTasks.length > 0;
            return (
              <article
                key={bot.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold">
                    {bot.emoji} {bot.name}
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      busy
                        ? "bg-amber-100 text-amber-900"
                        : bot.queuedCount > 0
                          ? "bg-sky-100 text-sky-900"
                          : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    {busy ? "active" : bot.queuedCount > 0 ? `${bot.queuedCount} queued` : "idle"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{bot.role}</p>
                {bot.activeTasks.map((t) => (
                  <p key={t.id} className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    ▶ {t.instruction.slice(0, 100)}
                  </p>
                ))}
                <button
                  type="button"
                  className="mt-3 text-xs font-bold text-sky-600"
                  onClick={() => {
                    setInstructBot(bot.id);
                    setTab("instruct");
                  }}
                >
                  Instruct →
                </button>
              </article>
            );
          })}
        </div>
      ) : null}

      {tab === "instruct" ? (
        <form onSubmit={(e) => void submitInstruct(e)} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <label className="text-xs font-bold uppercase text-slate-500">Send to bot</label>
          <select
            value={instructBot}
            onChange={(e) => setInstructBot(e.target.value as BotDeckBotId)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950"
          >
            {BOT_DECK_BOTS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.emoji} {b.name}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Instruction</label>
          <textarea
            value={instructText}
            onChange={(e) => setInstructText(e.target.value)}
            rows={4}
            placeholder="e.g. Wire hotel detail page with LiteAPI room rates — small diff only"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950"
          />
          <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Credit / scope note</label>
          <input
            value={creditNote}
            onChange={(e) => setCreditNote(e.target.value)}
            placeholder="Optional — e.g. no refactor, one file if possible"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950"
          />
          <button type="submit" className="mt-4 w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white">
            Assign task
          </button>
          {cursorPrompt ? (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40">
              <p className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-200">Cursor prompt</p>
              <p className="mt-1 text-sm">{cursorPrompt}</p>
              <button
                type="button"
                onClick={() => void copyPrompt(cursorPrompt)}
                className="mt-2 text-xs font-bold text-sky-700"
              >
                Copy to clipboard
              </button>
            </div>
          ) : null}
        </form>
      ) : null}

      {tab === "tasks" ? (
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks yet.</p>
          ) : (
            tasks.map((task) => (
              <article
                key={task.id}
                className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 ${
                  task.status === "done" || task.status === "cancelled" ? "opacity-60" : ""
                }`}
              >
                <p className="text-xs text-slate-500">
                  {botLabel(task.assignee)} · {task.status} · {new Date(task.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-sm font-medium">{task.instruction}</p>
                {task.creditNote ? <p className="mt-1 text-xs text-slate-500">Scope: {task.creditNote}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {task.status !== "in_progress" ? (
                    <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => void patchTask(task.id, "in_progress")}>
                      Start
                    </button>
                  ) : null}
                  {task.status !== "done" ? (
                    <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => void patchTask(task.id, "done")}>
                      Done
                    </button>
                  ) : null}
                  {task.status !== "cancelled" ? (
                    <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => void patchTask(task.id, "cancelled")}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === "messages" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
                <p className="text-[10px] text-slate-500">
                  {m.from} → {m.to} · {new Date(m.at).toLocaleString()}
                </p>
                <p className="text-sm">{m.text}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "memory" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <label className="text-xs font-bold uppercase text-slate-500">Bot memory</label>
            <select
              value={memoryBot}
              onChange={(e) => setMemoryBot(e.target.value as BotDeckBotId)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950"
            >
              {BOT_DECK_BOTS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.emoji} {b.name}
                </option>
              ))}
            </select>
            <textarea
              value={memoryEditor}
              onChange={(e) => setMemoryEditor(e.target.value)}
              rows={12}
              className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-950"
            />
            <button type="button" onClick={() => void saveMemory()} className="mt-3 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">
              Save bot memory
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <label className="text-xs font-bold uppercase text-slate-500">Project memory (master)</label>
            <textarea
              value={projectMemory}
              onChange={(e) => setProjectMemory(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-950"
            />
            <button type="button" onClick={() => void saveProjectMemory()} className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white">
              Save project memory
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
