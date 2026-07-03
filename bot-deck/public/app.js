const TOKEN_KEY = "kepi-bot-deck-token";

function token() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("token");
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl);
    params.delete("token");
    const clean = params.toString();
    history.replaceState({}, "", window.location.pathname + (clean ? `?${clean}` : ""));
  }
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const url = t && !path.includes("token=") ? `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}` : path;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

const BOTS = [
  { id: "conductor", name: "Conductor", emoji: "🎯" },
  { id: "hotel", name: "Hotel Bot", emoji: "🏨" },
  { id: "flight", name: "Flight Bot", emoji: "✈️" },
  { id: "airport", name: "Airport Bot", emoji: "🛫" },
  { id: "map", name: "Map Bot", emoji: "🗺️" },
];

function botLabel(id) {
  const b = BOTS.find((x) => x.id === id);
  return b ? `${b.emoji} ${b.name}` : id;
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
    });
  });
}

function fillBotSelects() {
  for (const sel of [document.getElementById("instructBot"), document.getElementById("memoryBot")]) {
    sel.innerHTML = BOTS.map((b) => `<option value="${b.id}">${b.emoji} ${b.name}</option>`).join("");
  }
}

async function loadHealth() {
  const health = await api("/api/health");
  const el = document.getElementById("phoneUrls");
  if (health.phones?.length) {
    el.innerHTML = `<strong>Phone (same Wi‑Fi):</strong> ${health.phones.map((u) => `<a href="${u}">${u}</a>`).join(" · ")}`;
  } else {
    el.textContent = "Phone: connect to same Wi‑Fi as this PC";
  }
}

async function loadDashboard() {
  const { bots } = await api("/api/bots");
  const root = document.getElementById("panel-dashboard");
  root.innerHTML = bots
    .map((bot) => {
      const busy = bot.activeTasks?.length > 0;
      const badge = busy
        ? `<span class="badge busy">${bot.activeTasks.length} active</span>`
        : bot.queuedCount > 0
          ? `<span class="badge queue">${bot.queuedCount} queued</span>`
          : `<span class="badge idle">idle</span>`;
      const active = (bot.activeTasks ?? [])
        .map((t) => `<p class="muted">▶ ${escapeHtml(t.instruction.slice(0, 120))}</p>`)
        .join("");
      return `<article class="card bot-card">
        <div class="bot-head">
          <span class="bot-name">${bot.emoji} ${escapeHtml(bot.name)}</span>
          ${badge}
        </div>
        <p class="muted">${escapeHtml(bot.role)}</p>
        ${active}
        <p class="muted">Memory: ${bot.memoryChars} chars · skill: ${escapeHtml(bot.skill)}</p>
        <button type="button" class="small" data-instruct="${bot.id}">Instruct</button>
      </article>`;
    })
    .join("");

  root.querySelectorAll("[data-instruct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("instructBot").value = btn.dataset.instruct;
      document.querySelector('.tab[data-tab="instruct"]').click();
    });
  });
}

async function loadTasks() {
  const { tasks } = await api("/api/tasks");
  const root = document.getElementById("panel-tasks");
  if (!tasks.length) {
    root.innerHTML = `<p class="muted card">No tasks yet — use Instruct tab.</p>`;
    return;
  }
  root.innerHTML = tasks
    .map(
      (t) => `<article class="card task ${t.status}">
      <p class="muted">${botLabel(t.assignee)} · ${t.status} · ${new Date(t.createdAt).toLocaleString()}</p>
      <p>${escapeHtml(t.instruction)}</p>
      ${t.creditNote ? `<p class="muted">Scope: ${escapeHtml(t.creditNote)}</p>` : ""}
      <div class="row">
        ${t.status !== "in_progress" ? `<button class="small" data-task="${t.id}" data-status="in_progress">Start</button>` : ""}
        ${t.status !== "done" ? `<button class="small" data-task="${t.id}" data-status="done">Done</button>` : ""}
        ${t.status !== "cancelled" ? `<button class="small" data-task="${t.id}" data-status="cancelled">Cancel</button>` : ""}
      </div>
    </article>`,
    )
    .join("");

  root.querySelectorAll("[data-task]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/tasks/${btn.dataset.task}`, {
        method: "PATCH",
        body: JSON.stringify({ status: btn.dataset.status }),
      });
      await refreshAll();
    });
  });
}

async function loadMessages() {
  const { messages } = await api("/api/messages");
  const root = document.getElementById("panel-messages");
  if (!messages.length) {
    root.innerHTML = `<p class="muted card">No messages yet.</p>`;
    return;
  }
  root.innerHTML = `<div class="card">${messages
    .map(
      (m) => `<div class="msg">
      <div class="msg-meta">${escapeHtml(m.from)} → ${escapeHtml(m.to)} · ${new Date(m.at).toLocaleString()}</div>
      <div>${escapeHtml(m.text)}</div>
    </div>`,
    )
    .join("")}</div>`;
}

async function loadMemoryEditor() {
  const botId = document.getElementById("memoryBot").value;
  const { content } = await api(`/api/memory/${botId}`);
  document.getElementById("memoryEditor").value = content;
  const proj = await api("/api/project-memory");
  document.getElementById("projectMemory").textContent = proj.content || "(empty)";
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function refreshAll() {
  await Promise.all([loadHealth(), loadDashboard(), loadTasks(), loadMessages(), loadMemoryEditor()]);
}

document.getElementById("refreshBtn").addEventListener("click", () => void refreshAll());

document.getElementById("instructForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bot = document.getElementById("instructBot").value;
  const instruction = document.getElementById("instructText").value.trim();
  const creditNote = document.getElementById("creditNote").value.trim();
  if (!instruction) return;
  const result = await api("/api/instruct", {
    method: "POST",
    body: JSON.stringify({ bot, instruction, creditNote }),
  });
  const promptEl = document.getElementById("cursorPrompt");
  promptEl.textContent = `Paste in Cursor: ${result.cursorPrompt}`;
  promptEl.classList.remove("hidden");
  document.getElementById("instructText").value = "";
  document.getElementById("creditNote").value = "";
  await refreshAll();
  document.querySelector('.tab[data-tab="tasks"]').click();
});

document.getElementById("memoryBot").addEventListener("change", () => void loadMemoryEditor());

document.getElementById("saveMemory").addEventListener("click", async () => {
  const botId = document.getElementById("memoryBot").value;
  const content = document.getElementById("memoryEditor").value;
  await api(`/api/memory/${botId}`, { method: "POST", body: JSON.stringify({ content }) });
  await refreshAll();
});

document.getElementById("appendNote").addEventListener("click", async () => {
  const botId = document.getElementById("memoryBot").value;
  const note = window.prompt("Note to append to bot memory:");
  if (!note?.trim()) return;
  await api(`/api/memory/${botId}`, {
    method: "PATCH",
    body: JSON.stringify({ note, syncConductor: botId !== "conductor" }),
  });
  await loadMemoryEditor();
});

setupTabs();
fillBotSelects();
void refreshAll();
setInterval(() => void refreshAll(), 30_000);
