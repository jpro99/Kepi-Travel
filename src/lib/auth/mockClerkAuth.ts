export function isMockClerkAuthEnabled(): boolean {
  return (
    process.env.CLERK_SECRET_KEY?.trim() === "test" &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() === "test"
  );
}

export function isAutomatedTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.JEST_WORKER_ID) ||
    process.env.npm_lifecycle_event?.startsWith("test") === true ||
    isMockClerkAuthEnabled()
  );
}
