import { kv } from "@vercel/kv";
import { inngest } from "@/inngest/client";

const DEFAULT_RUNTIME_STATE_KEY = "travel/runtime-state/default";
const USER_NAMESPACE_KEY_PATTERN = /^kepi:([^:]+):/;
const DEFAULT_USER_SCAN_LIMIT = 200;

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function resolveRuntimeStateKey(): string {
  return process.env.TRAVEL_UPDATE_RUNTIME_STATE_PATH ?? DEFAULT_RUNTIME_STATE_KEY;
}

function resolveUserScanLimit(): number {
  const parsed = Number(process.env.INNGEST_REMINDER_USER_SCAN_LIMIT ?? DEFAULT_USER_SCAN_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_USER_SCAN_LIMIT;
  return Math.max(1, Math.min(5000, Math.floor(parsed)));
}

async function listUsersWithRuntimeState(limit: number): Promise<string[]> {
  if (!isKvConfigured()) {
    return [];
  }

  const userIds = new Set<string>();
  const runtimeStateKey = resolveRuntimeStateKey();
  const match = `kepi:*:${runtimeStateKey}`;
  for await (const key of kv.scanIterator({ match })) {
    const matchResult = USER_NAMESPACE_KEY_PATTERN.exec(String(key));
    if (matchResult?.[1]) {
      userIds.add(matchResult[1]);
    }
    if (userIds.size >= limit) {
      break;
    }
  }

  return Array.from(userIds);
}

export const reminderLadder = inngest.createFunction(
  {
    id: "travel-reminder-ladder",
    name: "Travel reminder ladder scheduler",
    retries: 3,
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step, logger }) => {
    if (!isKvConfigured()) {
      logger.info("Skipping reminder ladder dispatch because KV is not configured.");
      return { status: "kv-unconfigured" as const, dispatchedUsers: 0 };
    }

    const userIds = await step.run("discover-runtime-users", async () =>
      listUsersWithRuntimeState(resolveUserScanLimit()),
    );

    if (userIds.length === 0) {
      return { status: "idle" as const, dispatchedUsers: 0 };
    }

    await step.run("dispatch-background-pass-events", async () => {
      await Promise.all(
        userIds.map((userId) =>
          inngest.send({
            name: "travel/update.requested",
            data: {
              userId,
              mode: "auto",
              trigger: "reminder-ladder",
            },
          }),
        ),
      );
    });

    return { status: "dispatched" as const, dispatchedUsers: userIds.length };
  },
);
