import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ENV_EXAMPLE_PATH = join(process.cwd(), ".env.example");
const GLOBAL_KEY = "__kepi_env_verify_done__";

type EnvVariableDefinition = {
  name: string;
  optional: boolean;
};

type ServiceGroup = {
  name: string;
  patterns: RegExp[];
};

const SERVICE_GROUPS: ServiceGroup[] = [
  { name: "Clerk", patterns: [/^CLERK_/u, /^NEXT_PUBLIC_CLERK_/u] },
  { name: "Gmail", patterns: [/^GMAIL_/u] },
  { name: "Inngest", patterns: [/^INNGEST_/u] },
  { name: "Sentry", patterns: [/^SENTRY_/u, /^NEXT_PUBLIC_SENTRY_/u] },
  { name: "Web Push", patterns: [/^VAPID_/u] },
  { name: "Map / Routing", patterns: [/^NEXT_PUBLIC_MAPTILER_/u, /^OPENROUTESERVICE_/u] },
  { name: "Aviation / Rail", patterns: [/^AVIATIONSTACK_/u, /^AMTRAK_/u] },
  { name: "Anthropic", patterns: [/^ANTHROPIC_/u] },
  { name: "Vercel KV", patterns: [/^KV_/u] },
  { name: "Upstash", patterns: [/^UPSTASH_/u] },
  { name: "Travel Update Runtime", patterns: [/^TRAVEL_UPDATE_/u] },
  { name: "Travel Alerts", patterns: [/^TRAVEL_ALERT_/u] },
];

function parseEnvDefinitions(source: string): EnvVariableDefinition[] {
  const definitions = new Map<string, EnvVariableDefinition>();
  const lines = source.split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^#?\s*([A-Z][A-Z0-9_]*)\s*=/u);
    if (!match) continue;

    const name = match[1];
    const optional = trimmed.startsWith("#");
    const existing = definitions.get(name);
    if (!existing) {
      definitions.set(name, { name, optional });
      continue;
    }
    definitions.set(name, { name, optional: existing.optional && optional });
  }

  return [...definitions.values()];
}

function missingFromProcessEnv(definition: EnvVariableDefinition): boolean {
  const current = process.env[definition.name];
  return typeof current !== "string" || current.trim().length === 0;
}

function resolveServiceGroup(variableName: string): string {
  const group = SERVICE_GROUPS.find((serviceGroup) =>
    serviceGroup.patterns.some((pattern) => pattern.test(variableName)),
  );
  return group?.name ?? "General";
}

function writeWarn(message: string): void {
  process.stderr.write(`[env:verify][warn] ${message}\n`);
}

function writeInfo(message: string): void {
  process.stdout.write(`[env:verify][info] ${message}\n`);
}

export function verifyEnvFromExampleAtBoot(): void {
  const flagStore = globalThis as typeof globalThis & Record<string, boolean | undefined>;
  if (flagStore[GLOBAL_KEY]) {
    return;
  }
  flagStore[GLOBAL_KEY] = true;

  try {
    const envExample = readFileSync(ENV_EXAMPLE_PATH, "utf8");
    const definitions = parseEnvDefinitions(envExample);
    const missing = definitions.filter(missingFromProcessEnv);
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    if (missing.length === 0) {
      writeInfo("All .env.example variables are set.");
      return;
    }

    const grouped = new Map<string, { required: string[]; optional: string[] }>();
    for (const variable of missing) {
      const serviceGroup = resolveServiceGroup(variable.name);
      const bucket = grouped.get(serviceGroup) ?? { required: [], optional: [] };
      if (variable.optional) {
        bucket.optional.push(variable.name);
      } else {
        bucket.required.push(variable.name);
      }
      grouped.set(serviceGroup, bucket);
    }

    writeWarn("Missing environment variables detected (development mode).");
    for (const [serviceGroup, variables] of grouped.entries()) {
      if (variables.required.length > 0) {
        writeWarn(`${serviceGroup} required (${variables.required.length}): ${variables.required.join(", ")}`);
      }
      if (variables.optional.length > 0) {
        writeWarn(`${serviceGroup} optional (${variables.optional.length}): ${variables.optional.join(", ")}`);
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    if (process.env.NODE_ENV === "development") {
      writeWarn(`Could not verify environment variables: ${reason}`);
    }
  }
}
