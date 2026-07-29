import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { HomeLanding } from "@/components/landing/HomeLanding";
import { getSubscriptionRecord, isSubscriptionActive } from "@/lib/billing/subscriptionStore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kepi Travel — Your trip, calmly handled",
  description:
    "Book anywhere. Forward confirmations. Kepi guides flights, stays, and Airport Mode — calmly, without overwhelm. Start free.",
  openGraph: {
    title: "Kepi Travel — Your trip, calmly handled",
    description:
      "A smart travel companion that hides the complexity. Start free — no invite required.",
    url: "/",
    type: "website",
  },
};

export default async function Home() {
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
        // redis unavailable — show full marketing page
      }
    }
  } catch {
    // clerk unavailable — show static page
  }

  return <HomeLanding userId={userId} hasProAccess={hasProAccess} />;
}
