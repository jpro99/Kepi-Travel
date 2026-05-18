import Stripe from "stripe";
import { logger } from "@/lib/logger";

let cachedStripeClient: Stripe | null = null;
let missingStripeKeyWarningLogged = false;

function resolveStripeSecretKey(): string | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return secretKey.length > 0 ? secretKey : null;
}

export function getStripePublishableKey(): string | null {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  return publishableKey.length > 0 ? publishableKey : null;
}

export function getStripeClient(): Stripe | null {
  const secretKey = resolveStripeSecretKey();
  if (!secretKey) {
    if (!missingStripeKeyWarningLogged) {
      missingStripeKeyWarningLogged = true;
      logger.warn("STRIPE_SECRET_KEY is missing. Billing APIs will return unavailable responses.", {
        scope: "billing/stripeClient",
      });
    }
    return null;
  }

  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(secretKey);
  }
  return cachedStripeClient;
}
