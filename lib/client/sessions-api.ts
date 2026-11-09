import type { Session } from "../contract";
import { isSession } from "./search-api";

export const SESSIONS_BATCH_SIZE = 50;

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const FRIENDLY_MESSAGE =
  "Your saved sessions could not be loaded. Please try again shortly.";

export function buildSessionsUrl(ids: string[]): string {
  return `/api/sessions?ids=${ids.map(encodeURIComponent).join(",")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function friendlyError(body: unknown): string {
  if (isRecord(body) && isRecord(body.error)) {
    const message = body.error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return FRIENDLY_MESSAGE;
}

async function fetchBatch(
  ids: string[],
  signal: AbortSignal,
): Promise<Session[]> {
  let response: Response;
  try {
    response = await fetch(buildSessionsUrl(ids), {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(FRIENDLY_MESSAGE);
  }
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new Error(FRIENDLY_MESSAGE);
  }
  if (!response.ok) throw new Error(friendlyError(body));
  if (!Array.isArray(body)) throw new Error(FRIENDLY_MESSAGE);
  return body.filter(isSession);
}

export async function fetchSessionsByIds(
  ids: string[],
  signal: AbortSignal,
): Promise<Session[]> {
  const validIds = [...new Set(ids)].filter((id) =>
    SESSION_ID_PATTERN.test(id),
  );
  const sessions: Session[] = [];
  for (let start = 0; start < validIds.length; start += SESSIONS_BATCH_SIZE) {
    const batch = validIds.slice(start, start + SESSIONS_BATCH_SIZE);
    sessions.push(...(await fetchBatch(batch, signal)));
  }
  return sessions;
}
