import { LandingShell } from "@/components/landing/LandingShell";
import { auth } from "@clerk/nextjs/server";
import { getSubscriptionRecord, isSubscriptionActive } from "@/lib/billing/subscriptionStore";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let userId: string | null = null;
  let hasProAccess = false;

  try {
    const session = await auth();
    userId = session.userId ?? null;
    if (userId) {
      try {
        const sub = await getSubscriptionRecord(userId);
        hasProAccess = Boolean(
          sub && (sub.lifetimePlan || (isSubscriptionActive(sub) && sub.plan !== "free")),
        );
      } catch {
        /* redis unavailable */
      }
    }
  } catch {
    /* clerk unavailable — show static page */
  }

  return <LandingShell userId={userId} hasProAccess={hasProAccess} />;
}
