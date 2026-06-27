#!/usr/bin/env node
/**
 * Kepi Bot Deck — local control panel (NOT deployed to kepitravel.com)
 * Run: cd bot-deck && npm start
 * Phone: same Wi‑Fi → http://<your-pc-ip>:3847
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const MEMORY_DIR = path.join(ROOT, "memory");
const STATE_DIR = path.join(ROOT, "state");
const PUBLIC_DIR = path.join(ROOT, "public");
const TASKS_FILE = path.join(STATE_DIR, "tasks.json");
const MESSAGES_FILE = path.join(STATE_DIR, "messages.json");
const PROJECT_MEMORY = path.join(ROOT, "..", "KEPI_PROJECT_MEMORY.md");

const PORT = Number(process.env.BOT_DECK_PORT ?? 3847);
const HOST = process.env.BOT_DECK_HOST ?? "0.0.0.0";
const TOKEN = process.env.BOT_DECK_TOKEN?.trim() || "";

const BOTS = [
  { id: "conductor", name: "Conductor", emoji: "🎯", role: "Orchestrator — routes all bots", skill: "kepi-conductor" },
  { id: "hotel", name: "Hotel Bot", emoji: "🏨", role: "Stays, LiteAPI, profile, planner", skill: "kepi-hotel-bot" },
  { id: "flight", name: "Flight Bot", emoji: "✈️", role: "Duffel air, Flights tab", skill: "kepi-flight-bot" },
  { id: "airport", name: "Airport Bot", emoji: "🛫", role: "Nav, connections, guidance", skill: "kepi-airport-bot" },
  { id: "map", name: "Map Bot", emoji: "🗺️", role: "Live map, family GPS", skill: "kepi-map-bot" },
];

function botById(id) {
  return BOTS.find((b) => b.id === id);
}

function memoryPath(botId) {
  return path.join(MEMORY_DIR, `${botId}.md`);
}

async function ensureState() {
  await fs.mkdir(STATE_DIR, { recursive: true });
  for (const file of [TASKS_FILE, MESSAGES_FILE]) {
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, "[]", "utf8");
    }
  }
}

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function localIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function checkAuth(req, url) {
  if (!TOKEN) return true;
  const header = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const query = url.searchParams.get("token");
  return header === TOKEN || query === TOKEN;
}

async function readMemory(botId) {
  try {
    return await fs.readFile(memoryPath(botId), "utf8");
  } catch {
    return "";
  }
}

async function appendMemory(botId, note) {
  const line = `\n\n## ${new Date().toISOString()}\n${note.trim()}\n`;
  await fs.appendFile(memoryPath(botId), line, "utf8");
}

async function readProjectMemory() {
  try {
    return await fs.readFile(PROJECT_MEMORY, "utf8");
  } catch {
    return "";
  }
}

async function buildBotSummary() {
  const tasks = await readJson(TASKS_FILE);
  return Promise.all(
    BOTS.map(async (bot) => {
      const memory = await readMemory(bot.id);
      const active = tasks.filter((t) => t.assignee === bot.id && t.status === "in_progress");
      const queued = tasks.filter((t) => t.assignee === bot.id && t.status === "pending");
      return {
        ...bot,
        memoryPreview: memory.split("\n").slice(0, 8).join("\n"),
        memoryChars: memory.length,
        activeTasks: active,
        queuedCount: queued.length,
      };
    }),
  );
}

async function handleApi(req, res, url) {
  if (!checkAuth(req, url)) {
    return sendJson(res, 401, { error: "Unauthorized — set BOT_DECK_TOKEN or pass ?token=" });
  }

  const method = req.method ?? "GET";
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  if (parts[0] === "health" && method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      port: PORT,
      phones: localIps().map((ip) => `http://${ip}:${PORT}`),
      projectMemory: path.basename(PROJECT_MEMORY),
    });
  }

  if (parts[0] === "bots" && parts.length === 1 && method === "GET") {
    const bots = await buildBotSummary();
    return sendJson(res, 200, { bots });
  }

  if (parts[0] === "bots" && parts.length === 2 && parts[1] !== "memory" && method === "GET") {
    const bot = botById(parts[1]);
    if (!bot) return sendJson(res, 404, { error: "Unknown bot" });
    const memory = await readMemory(bot.id);
    const tasks = (await readJson(TASKS_FILE)).filter((t) => t.assignee === bot.id);
    return sendJson(res, 200, { bot, memory, tasks });
  }

  if (parts[0] === "bots" && parts.length === 3 && parts[2] === "memory" && method === "GET") {
    const bot = botById(parts[1]);
    if (!bot) return sendJson(res, 404, { error: "Unknown bot" });
    return sendJson(res, 200, { botId: bot.id, content: await readMemory(bot.id) });
  }

  if (parts[0] === "memory" && parts.length === 2 && method === "GET") {
    const bot = botById(parts[1]);
    if (!bot) return sendJson(res, 404, { error: "Unknown bot" });
    return sendJson(res, 200, { botId: bot.id, content: await readMemory(bot.id) });
  }

  if (parts[0] === "memory" && parts.length === 2 && method === "POST") {
    const bot = botById(parts[1]);
    if (!bot) return sendJson(res, 404, { error: "Unknown bot" });
    const body = await parseBody(req);
    if (!body.content?.trim()) return sendJson(res, 400, { error: "content required" });
    await fs.writeFile(memoryPath(bot.id), body.content.trim() + "\n", "utf8");
    return sendJson(res, 200, { ok: true });
  }

  if (parts[0] === "memory" && parts.length === 2 && method === "PATCH") {
    const bot = botById(parts[1]);
    if (!bot) return sendJson(res, 404, { error: "Unknown bot" });
    const body = await parseBody(req);
    if (!body.note?.trim()) return sendJson(res, 400, { error: "note required" });
    await appendMemory(bot.id, body.note);
    if (bot.id !== "conductor" && body.syncConductor) {
      await appendMemory("conductor", `[${bot.name}] ${body.note}`);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (parts[0] === "project-memory" && method === "GET") {
    return sendJson(res, 200, { content: await readProjectMemory() });
  }

  if (parts[0] === "tasks" && method === "GET") {
    const tasks = await readJson(TASKS_FILE);
    const assignee = url.searchParams.get("assignee");
    const filtered = assignee ? tasks.filter((t) => t.assignee === assignee) : tasks;
    return sendJson(res, 200, { tasks: filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  }

  if (parts[0] === "tasks" && method === "POST") {
    const body = await parseBody(req);
    const assignee = body.assignee ?? "hotel";
    if (!botById(assignee)) return sendJson(res, 400, { error: "Invalid assignee" });
    if (!body.instruction?.trim()) return sendJson(res, 400, { error: "instruction required" });

    const tasks = await readJson(TASKS_FILE);
    const task = {
      id: newId(),
      assignee,
      instruction: body.instruction.trim(),
      status: body.status ?? "pending",
      priority: body.priority ?? "normal",
      creditNote: body.creditNote?.trim() ?? "",
      from: body.from ?? "jeff",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tasks.unshift(task);
    await writeJson(TASKS_FILE, tasks.slice(0, 200));

    const messages = await readJson(MESSAGES_FILE);
    messages.unshift({
      id: newId(),
      from: body.from ?? "jeff",
      to: assignee,
      text: body.instruction.trim(),
      taskId: task.id,
      at: new Date().toISOString(),
    });
    await writeJson(MESSAGES_FILE, messages.slice(0, 500));

    if (assignee !== "conductor") {
      await appendMemory(assignee, `**Task assigned:** ${body.instruction.trim()}`);
    }
    await appendMemory("conductor", `Assigned to **${assignee}:** ${body.instruction.trim()}`);

    return sendJson(res, 201, { task });
  }

  if (parts[0] === "tasks" && parts.length === 2 && method === "PATCH") {
    const tasks = await readJson(TASKS_FILE);
    const idx = tasks.findIndex((t) => t.id === parts[1]);
    if (idx < 0) return sendJson(res, 404, { error: "Task not found" });
    const body = await parseBody(req);
    tasks[idx] = {
      ...tasks[idx],
      ...body,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(TASKS_FILE, tasks);
    return sendJson(res, 200, { task: tasks[idx] });
  }

  if (parts[0] === "messages" && method === "GET") {
    const messages = await readJson(MESSAGES_FILE);
    return sendJson(res, 200, { messages: messages.slice(0, 100) });
  }

  if (parts[0] === "messages" && method === "POST") {
    const body = await parseBody(req);
    const to = body.to ?? "conductor";
    if (!botById(to) && to !== "jeff") return sendJson(res, 400, { error: "Invalid recipient" });
    if (!body.text?.trim()) return sendJson(res, 400, { error: "text required" });

    const messages = await readJson(MESSAGES_FILE);
    const msg = {
      id: newId(),
      from: body.from ?? "jeff",
      to,
      text: body.text.trim(),
      at: new Date().toISOString(),
    };
    messages.unshift(msg);
    await writeJson(MESSAGES_FILE, messages.slice(0, 500));

    if (botById(to)) {
      await appendMemory(to.id, `**Message from ${msg.from}:** ${body.text.trim()}`);
    }
    if (to !== "conductor" && body.from !== "conductor") {
      await appendMemory("conductor", `[${msg.from} → ${to}] ${body.text.trim()}`);
    }

    return sendJson(res, 201, { message: msg });
  }

  if (parts[0] === "instruct" && method === "POST") {
    const body = await parseBody(req);
    body.assignee = body.bot ?? body.assignee ?? "conductor";
    body.from = body.from ?? "jeff";
    const tasks = await readJson(TASKS_FILE);
    const assignee = body.assignee;
    if (!botById(assignee)) return sendJson(res, 400, { error: "Invalid bot" });
    if (!body.instruction?.trim()) return sendJson(res, 400, { error: "instruction required" });
    const task = {
      id: newId(),
      assignee,
      instruction: body.instruction.trim(),
      status: "pending",
      priority: body.priority ?? "normal",
      creditNote: body.creditNote?.trim() ?? "",
      from: body.from,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tasks.unshift(task);
    await writeJson(TASKS_FILE, tasks.slice(0, 200));
    const messages = await readJson(MESSAGES_FILE);
    messages.unshift({
      id: newId(),
      from: body.from,
      to: assignee,
      text: body.instruction.trim(),
      taskId: task.id,
      at: new Date().toISOString(),
    });
    await writeJson(MESSAGES_FILE, messages.slice(0, 500));
    await appendMemory(assignee, `**Task assigned:** ${body.instruction.trim()}`);
    if (assignee !== "conductor") {
      await appendMemory("conductor", `Assigned to **${assignee}:** ${body.instruction.trim()}`);
    }
    return sendJson(res, 201, { task, cursorPrompt: `Follow ${botById(assignee).skill}: ${body.instruction.trim()}` });
  }

  return sendJson(res, 404, { error: "Not found" });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function serveStatic(res, filePath) {
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(data);
}

async function main() {
  await ensureState();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (url.pathname.startsWith("/api/")) {
        return await handleApi(req, res, url);
      }

      let file = url.pathname === "/" ? "/index.html" : url.pathname;
      const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(PUBLIC_DIR, safe);
      if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      try {
        await fs.access(filePath);
        return await serveStatic(res, filePath);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : "Server error" });
    }
  });

  server.listen(PORT, HOST, () => {
    const ips = localIps();
    console.log("\n  Kepi Bot Deck — local bot control (not kepitravel.com)\n");
    console.log(`  Desktop:  http://127.0.0.1:${PORT}`);
    for (const ip of ips) console.log(`  Phone:    http://${ip}:${PORT}  (same Wi‑Fi)`);
    if (TOKEN) console.log("\n  Auth: BOT_DECK_TOKEN is set — add ?token=... on phone");
    console.log("\n  Stop: Ctrl+C\n");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
