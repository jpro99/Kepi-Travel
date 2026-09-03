import { config as loadEnv } from "dotenv";
import * as path from "path";

/** Load e2e defaults without clobbering CI / shell secrets (dotenv override=false). */
export function loadE2eEnv(): void {
  const root = path.resolve(__dirname, "../../..");
  loadEnv({ path: path.join(root, ".env.test") });
  loadEnv({ path: path.join(root, ".env.local") });

  if (!process.env.CLERK_PUBLISHABLE_KEY?.trim() && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
    process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  }
}

export function hasRealClerkKeysForE2e(): boolean {
  const secret = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  return Boolean(secret && publishable && secret !== "test" && publishable !== "test");
}

/** Playwright webServer.env requires Record<string, string> — no undefined values. */
export function buildE2eWebServerEnv(): Record<string, string> {
  const env: Record<string, string> = {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in",
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/sign-up",
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:
      process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL ?? "/travel-assistant",
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:
      process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL ?? "/travel-assistant",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "e2e-nextauth-secret",
  };

  if (hasRealClerkKeysForE2e()) {
    env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY!.trim();
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!.trim();
  }

  return env;
}
