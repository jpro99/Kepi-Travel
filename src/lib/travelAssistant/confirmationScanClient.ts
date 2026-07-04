export function pickScanDraftForType<T extends { type?: string }>(
  drafts: T[],
  preferredType?: string,
): T | null {
  if (drafts.length === 0) return null;
  if (!preferredType) return drafts[0] ?? null;
  const normalizedPreferred = preferredType.toLowerCase();
  const mapType = (raw: string | undefined): string => {
    const value = (raw ?? "").toLowerCase();
    if (value === "ride" || value === "car") return "car";
    return value;
  };
  return drafts.find((draft) => mapType(draft.type) === normalizedPreferred) ?? drafts[0] ?? null;
}

export async function readTicketScanResponse(response: Response): Promise<{
  ok: boolean;
  status: number;
  payload: {
    error?: string;
    draft?: Record<string, unknown>;
    drafts?: Array<Record<string, unknown>>;
    count?: number;
  };
}> {
  const status = response.status;
  let text = "";
  try {
    text = await response.text();
  } catch {
    return {
      ok: false,
      status,
      payload: { error: "Could not read server response. Check your connection and try again." },
    };
  }
  if (!text.trim()) {
    return {
      ok: response.ok,
      status,
      payload: {
        error: response.ok
          ? "Scan returned an empty response."
          : `Scan failed (${status}). Try again on Wi-Fi.`,
      },
    };
  }
  try {
    const payload = JSON.parse(text) as {
      error?: string;
      draft?: Record<string, unknown>;
      drafts?: Array<Record<string, unknown>>;
      count?: number;
    };
    return { ok: response.ok, status, payload };
  } catch {
    return {
      ok: false,
      status,
      payload: {
        error:
          status === 401
            ? "Session expired — refresh the page and sign in again."
            : `Scan failed (${status}). The server returned an unexpected response.`,
      },
    };
  }
}
