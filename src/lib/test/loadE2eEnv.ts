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
