import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { getStripeClient } from "@/lib/billing/stripeClient";
import {
  FREE_SUBSCRIPTION_RECORD,
  getSubscriptionRecord,
  getSubscriptionStorageKey,
  setSubscriptionRecord,
} from "@/lib/billing/subscriptionStore";
import { logger } from "@/lib/logger";
import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";
import { kvStoreDel, kvStoreList } from "@/lib/travelAssistant/kvStore";
import { unsubscribeUser } from "@/lib/travelAssistant/pushNotificationService";

export type DeleteAccountResult = {
  ok: true;
  deletedClerkUser: boolean;
  cancelledStripeSubscription: boolean;
  kvKeysRemoved: number;
};

/**
 * Irreversible account wipe for Apple Guideline 5.1.1(v) account deletion.
 * Order: cancel Stripe → wipe KV/billing mirrors → delete Clerk user.
 */
export async function deleteUserAccount(userId: string): Promise<DeleteAccountResult> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Missing user id.");
  }

  let cancelledStripeSubscription = false;
  const subscription = await getSubscriptionRecord(normalizedUserId);
  const stripe = getStripeClient();
  if (stripe && subscription.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      cancelledStripeSubscription = true;
    } catch (error) {
      logger.warn("Stripe subscription cancel failed during account deletion; continuing wipe.", {
        scope: "account/deleteUserAccount",
        userId: normalizedUserId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  try {
    await setSubscriptionRecord(normalizedUserId, {
      ...FREE_SUBSCRIPTION_RECORD,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
  } catch (error) {
    logger.warn("Failed to clear subscription record during account deletion.", {
      scope: "account/deleteUserAccount",
      userId: normalizedUserId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  try {
    await unsubscribeUser(normalizedUserId);
  } catch {
    // best-effort
  }

  let kvKeysRemoved = 0;
  try {
    const entries = await kvStoreList("", { userId: normalizedUserId, limit: 5000 });
    await Promise.all(
      entries.map(async (entry) => {
        // entry.key is already fully namespaced (kepi:userId:…); kvStoreDel preserves that form.
        await kvStoreDel(entry.key, { userId: normalizedUserId });
        kvKeysRemoved += 1;
      }),
    );
  } catch (error) {
    logger.warn("KV namespace wipe incomplete during account deletion.", {
      scope: "account/deleteUserAccount",
      userId: normalizedUserId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  // Billing storage keys that may sit outside the namespaced list helper.
  if (hasRedisEnvConfig()) {
    const redis = getSafeRedisClient("account/deleteUserAccount");
    if (redis) {
      try {
        await redis.del(getSubscriptionStorageKey(normalizedUserId));
        await redis.del(`billing:plan:clerk_${normalizedUserId}`);
        await redis.del(`user:lifetime:${normalizedUserId}`);
      } catch {
        // best-effort
      }
    }
  }

  const client = await clerkClient();
  await client.users.deleteUser(normalizedUserId);

  logger.info("User account deleted.", {
    scope: "account/deleteUserAccount",
    userId: normalizedUserId,
    cancelledStripeSubscription,
    kvKeysRemoved,
  });

  return {
    ok: true,
    deletedClerkUser: true,
    cancelledStripeSubscription,
    kvKeysRemoved,
  };
}
