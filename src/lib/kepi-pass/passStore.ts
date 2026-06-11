import "server-only";
import { getSafeRedisClient } from "@/lib/redis";
import { generateId } from "@/lib/utils/generateId";
import { KepiPass } from "./types";

const KEPI_PASS_PREFIX = "kepi-pass:";
const KEPI_PASS_ID_PREFIX = "kp_";

/**
 * Generates a unique, secure ID for a new Kepi Pass.
 */
function generateKepiPassId(): string {
  return `${KEPI_PASS_ID_PREFIX}${generateId(24)}`;
}

/**
 * Constructs the Redis key for a given Kepi Pass ID.
 */
function getPassStorageKey(passId: string): string {
  return `${KEPI_PASS_PREFIX}${passId}`;
}

/**
 * Retrieves a Kepi Pass record from Redis.
 * @param passId The ID of the pass to retrieve.
 * @returns The KepiPass object or null if not found.
 */
export async function getKepiPassRecord(passId: string): Promise<KepiPass | null> {
  const redis = getSafeRedisClient("passStore.getKepiPassRecord");
  if (!redis) return null;

  try {
    return await redis.get<KepiPass>(getPassStorageKey(passId));
  } catch (error) {
    console.error("Error fetching Kepi Pass from Redis:", error);
    return null;
  }
}

/**
 * Creates a new Kepi Pass and stores it in Redis.
 */
export async function createKepiPass(args: {
  type: "GOLDEN" | "SILVER";
  createdBy: string;
  intendedEmail: string;
  note?: string;
}): Promise<KepiPass> {
  const redis = getSafeRedisClient("passStore.createKepiPass");
  if (!redis) {
    throw new Error("Redis client is not available. Cannot create Kepi Pass.");
  }

  const newPass: KepiPass = {
    id: generateKepiPassId(),
    type: args.type,
    status: "new",
    createdBy: args.createdBy,
    createdAt: new Date().toISOString(),
    intendedEmail: args.intendedEmail,
    note: args.note,
  };

  try {
    await redis.set(getPassStorageKey(newPass.id), newPass, {
      // Set an expiry for the pass, e.g., 1 year for it to be claimed.
      // Golden passes, once claimed, grant lifetime access, but the pass itself can expire.
      ex: 365 * 24 * 60 * 60, 
    });
    return newPass;
  } catch (error) {
    console.error("Error creating Kepi Pass in Redis:", error);
    throw new Error("Failed to save Kepi Pass to the data store.");
  }
}

/**
 * Marks a Kepi Pass as redeemed in Redis.
 * @returns The updated KepiPass object or null if the pass doesn't exist.
 */
export async function redeemKepiPass(passId: string, userId: string): Promise<KepiPass | null> {
    const redis = getSafeRedisClient("passStore.redeemKepiPass");
    if (!redis) {
        throw new Error("Redis client is not available. Cannot redeem Kepi Pass.");
    }

    const key = getPassStorageKey(passId);

    // Use a transaction to safely fetch and update the pass
    const transaction = redis.multi();
    transaction.get(key);
    const [passRecord] = (await transaction.exec()) as [KepiPass | null];

    if (!passRecord) {
        return null; // Pass not found
    }

    if (passRecord.status === "redeemed") {
        // This pass has already been used. 
        // We can return the record to check who used it.
        return passRecord;
    }

    const updatedPass: KepiPass = {
        ...passRecord,
        status: "redeemed",
        redeemedBy: userId,
        redeemedAt: new Date().toISOString(),
    };

    await redis.set(key, updatedPass);

    return updatedPass;
}
