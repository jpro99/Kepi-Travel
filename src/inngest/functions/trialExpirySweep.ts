import { inngest } from "@/inngest/client";
import { getSubscriptionRecord, listExpiredTrialUserIds, setSubscriptionRecord } from "@/lib/billing/subscriptionStore";

export const trialExpirySweep = inngest.createFunction(
  {
    id: "trial-expiry-sweep",
    name: "Invite trial expiry sweep",
    retries: 1,
    triggers: [{ cron: "15 2 * * *" }],
  },
  async ({ step, logger }) => {
    const expiredUserIds = await step.run("discover-expired-trials", async () => listExpiredTrialUserIds());
    if (expiredUserIds.length === 0) {
      logger.info("No expired trial users found.");
      return {
        status: "idle" as const,
        downgradedUsers: 0,
      };
    }

    const downgradedUsers = await step.run("downgrade-expired-trials", async () => {
      let downgradedCount = 0;
      for (const userId of expiredUserIds) {
        const existing = await getSubscriptionRecord(userId);
        if (!existing.trialExpiresAt) {
          continue;
        }
        if (Date.parse(existing.trialExpiresAt) > Date.now()) {
          continue;
        }
        await setSubscriptionRecord(userId, {
          plan: "free",
          stripeCustomerId: existing.stripeCustomerId,
          stripeSubscriptionId: null,
          validUntil: null,
          lifetimePlan: false,
          trialExpiresAt: null,
        });
        downgradedCount += 1;
      }
      return downgradedCount;
    });

    return {
      status: "completed" as const,
      downgradedUsers,
    };
  },
);
