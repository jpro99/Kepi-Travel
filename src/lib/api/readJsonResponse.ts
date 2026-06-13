/** Human-readable API errors — never surface raw JSON blobs on mobile. */
export function formatApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const err = (payload as { error?: unknown }).error;
    if (typeof err === "string" && err.trim().length > 0) {
      return err.trim();
    }
  }
  if (status === 401 || status === 404) {
    return "Session expired — please sign in again.";
  }
  if (status === 429) {
    return "Too many requests — wait a moment and try again.";
  }
  return `Something went wrong (${status}). Please try again.`;
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(formatApiErrorMessage(null, response.status));
  }
  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(formatApiErrorMessage(payload, response.status));
  }
  return payload;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  return readJsonResponse<T>(response);
}
