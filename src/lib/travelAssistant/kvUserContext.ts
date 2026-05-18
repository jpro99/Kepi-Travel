import { AsyncLocalStorage } from "node:async_hooks";

const kvUserContext = new AsyncLocalStorage<{ userId: string }>();

export function getKvUserContextUserId(): string | undefined {
  return kvUserContext.getStore()?.userId;
}

export async function runWithKvUserContext<T>(
  userId: string | undefined,
  task: () => Promise<T>,
): Promise<T> {
  if (!userId || userId.trim().length === 0) {
    return task();
  }
  return kvUserContext.run({ userId: userId.trim() }, task);
}
