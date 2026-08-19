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

function isJsonParseSyntaxError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && /is not valid JSON|Unexpected token/i.test(error.message))
  );
}

/** Map fetch/JSON failures to calm copy — never show raw SyntaxError text in toasts. */
export function userFacingFetchError(error: unknown, fallback: string): string {
  if (isJsonParseSyntaxError(error)) {
    return fallback;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return fallback;
}

export async function parseResponseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(formatApiErrorMessage(null, response.status));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(formatApiErrorMessage(null, response.status));
  }
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await parseResponseJson<T>(response);
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
