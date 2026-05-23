import { NextResponse } from "next/server";
import { getKvIntegrationHealth } from "@/lib/travelAssistant/kvStore";

type IntegrationHealth = {
  status: "ok" | "degraded";
  configured: boolean;
  mode: string;
  message: string;
  missingEnvKeys: string[];
};

function buildEnvBackedIntegrationHealth(args: {
  envKeys: readonly string[];
  modeWhenConfigured: string;
  modeWhenMissing: string;
  configuredMessage: string;
  missingMessage: string;
}): IntegrationHealth {
  const missingEnvKeys = args.envKeys.filter((key) => !process.env[key]?.trim());
  const configured = missingEnvKeys.length === 0;
  return {
    status: configured ? "ok" : "degraded",
    configured,
    mode: configured ? args.modeWhenConfigured : args.modeWhenMissing,
    message: configured ? args.configuredMessage : args.missingMessage,
    missingEnvKeys,
  };
}

export async function GET() {
  const kv = getKvIntegrationHealth();
  const integrations = {
    upstashRedis: {
      status: kv.configured ? "ok" : "degraded",
      configured: kv.configured,
      mode: kv.mode,
      message: kv.configured
        ? "Upstash Redis credentials are configured."
        : "Upstash credentials missing; using in-memory fallback store.",
      missingEnvKeys: kv.missingEnvKeys,
    } satisfies IntegrationHealth,
    aviationStack: buildEnvBackedIntegrationHealth({
      envKeys: ["AVIATIONSTACK_API_KEY"],
      modeWhenConfigured: "live",
      modeWhenMissing: "mock-fallback",
      configuredMessage: "AviationStack live updates enabled.",
      missingMessage: "AVIATIONSTACK_API_KEY missing; flight updates fallback to mock data.",
    }),
    anthropic: buildEnvBackedIntegrationHealth({
      envKeys: ["ANTHROPIC_API_KEY"],
      modeWhenConfigured: "live",
      modeWhenMissing: "placeholder-fallback",
      configuredMessage: "Anthropic live suggestions enabled.",
      missingMessage: "ANTHROPIC_API_KEY missing; AI suggestions return placeholder guidance.",
    }),
    upstashRateLimit: buildEnvBackedIntegrationHealth({
      envKeys: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
      modeWhenConfigured: "upstash-redis",
      modeWhenMissing: "memory-fallback",
      configuredMessage: "Upstash Redis rate limiting enabled.",
      missingMessage: "Upstash credentials missing; rate limits use in-memory fallback.",
    }),
  };

  const overallStatus = Object.values(integrations).every((integration) => integration.status === "ok")
    ? "ok"
    : "degraded";

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    integrations,
  });
}
