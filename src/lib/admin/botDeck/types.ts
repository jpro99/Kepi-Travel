export type BotDeckBotId = "conductor" | "hotel" | "flight" | "airport" | "map";

export type BotDeckTaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export interface BotDeckBot {
  id: BotDeckBotId;
  name: string;
  emoji: string;
  role: string;
  skill: string;
}

export interface BotDeckTask {
  id: string;
  assignee: BotDeckBotId;
  instruction: string;
  status: BotDeckTaskStatus;
  priority: "low" | "normal" | "high";
  creditNote: string;
  from: string;
  createdAt: string;
  updatedAt: string;
}

export interface BotDeckMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  taskId?: string;
  at: string;
}

export const BOT_DECK_BOTS: BotDeckBot[] = [
  { id: "conductor", name: "Conductor", emoji: "🎯", role: "Orchestrator — routes all bots", skill: "kepi-conductor" },
  { id: "hotel", name: "Hotel Bot", emoji: "🏨", role: "Stays, LiteAPI, profile, planner", skill: "kepi-hotel-bot" },
  { id: "flight", name: "Flight Bot", emoji: "✈️", role: "Duffel air, Flights tab", skill: "kepi-flight-bot" },
  { id: "airport", name: "Airport Bot", emoji: "🛫", role: "Nav, connections, guidance", skill: "kepi-airport-bot" },
  { id: "map", name: "Map Bot", emoji: "🗺️", role: "Live map, family GPS", skill: "kepi-map-bot" },
];

export function botDeckBot(id: string): BotDeckBot | undefined {
  return BOT_DECK_BOTS.find((bot) => bot.id === id);
}

export const DEFAULT_BOT_MEMORY: Record<BotDeckBotId, string> = {
  conductor: `# Conductor memory (master)

- Route work to hotel, flight, airport, map bots
- Duffel Stays emails already sent — do not re-suggest
- Ship gate: lint + build before push
- Remote control: /admin/bots on kepitravel.com (admin only) + local bot-deck/ on PC
`,
  hotel: `# Hotel bot memory

- LiteAPI wired (LITEAPI_KEY on Vercel); Duffel Stays pending
- Stay profile + trip segment planner shipped
- Travelpayouts Drive skipped
`,
  flight: `# Flight bot memory

- Duffel flights live via DUFFEL_ACCESS_TOKEN
- Flight segments feed hotel stay planner
`,
  airport: `# Airport bot memory

- Timezone: Date.UTC + Intl — never new Date(localString)
- No illegal/impossible/rebook headlines for through-tickets
`,
  map: `# Map bot memory

- Family GPS via /api/family
- Lazy Redis; graceful degradation
`,
};

export const DEFAULT_PROJECT_MEMORY = `# Kepi project memory (admin editable)

- Production: https://kepitravel.com
- Duffel Stays: not enabled; owner already emailed support
- LiteAPI: key on Vercel
- Travelpayouts Drive: not used
`;
