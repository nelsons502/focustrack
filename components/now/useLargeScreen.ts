import { useSyncExternalStore } from "react";

export const LARGE_SCREEN_QUERY = "(min-width: 900px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const list = window.matchMedia(LARGE_SCREEN_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(LARGE_SCREEN_QUERY).matches;
}

export function useLargeScreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
