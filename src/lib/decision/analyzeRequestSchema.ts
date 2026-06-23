import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";

const AUTH_TIMEOUT_MS = 1_200;

export const ExpertSchema = z
  .object({
    enabled: z.boolean().optional(),
    originIata: z.string().trim().length(3).optional(),
    cppFloor: z.number().min(0).max(10).optional(),
    dateFlexDays: z.union([z.literal(3), z.literal(7), z.literal(14)]).optional(),
    pointsProgram: z.string().trim().max(80).optional(),
    legDateOverrides: z.record(z.string(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  })
  .optional();

export const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  comfortWeight: z.number().min(0).max(1).optional(),
  planMode: z.enum(["flights", "hotels", "full"]).optional(),
  paymentMode: z.enum(["cash", "points", "mix"]).optional(),
  enabledLegIds: z.array(z.string()).optional(),
  expert: ExpertSchema,
  /** Kept for client compatibility. Analyze now always returns the fast brief —
   *  live pricing/topology/award search happens via a separate POST to /api/decision/enrich. */
  fastPath: z.boolean().optional(),
});

/** Shared by /api/decision/strategies and /api/decision/enrich — caps auth lookup so a slow
 * session check can't itself blow the fast-brief latency budget. */
export async function resolveUserIdFast(): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolveAuthenticatedUserId(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), AUTH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
