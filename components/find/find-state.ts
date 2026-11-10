export const FIND_STORAGE_KEY = "focustrack:find:v1";
export const FIND_PAGE_SIZE = 30;
// The search API returns at most this many results and no total, so a
// response this full cannot be presented as a complete count.
export const FIND_RESULT_LIMIT = 30;
export const FIND_FILTER_DEBOUNCE_MS = 300;

export type StoredFindState = {
  q: string;
  day: string;
  excludeRestricted: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStoredFindState(
  allowedDays: readonly string[],
): StoredFindState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FIND_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (typeof parsed.q !== "string") return null;
    if (typeof parsed.day !== "string" || !allowedDays.includes(parsed.day)) {
      return null;
    }
    if (typeof parsed.excludeRestricted !== "boolean") return null;
    return {
      q: parsed.q.slice(0, 300),
      day: parsed.day,
      excludeRestricted: parsed.excludeRestricted,
    };
  } catch {
    return null;
  }
}

export function writeStoredFindState(state: StoredFindState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      FIND_STORAGE_KEY,
      JSON.stringify({
        q: state.q.slice(0, 300),
        day: state.day,
        excludeRestricted: state.excludeRestricted,
      }),
    );
  } catch {
    // Storage may be unavailable (private mode, quota); Find still works without it.
  }
}
