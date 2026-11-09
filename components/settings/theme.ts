export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "focustrack:theme";

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeThemeChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getThemeServerSnapshot(): ThemeChoice {
  return "system";
}

export function readThemeChoice(): ThemeChoice {
  try {
    if (typeof window === "undefined") return "system";
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  try {
    if (typeof document === "undefined") return;
    if (choice === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = choice;
    }
  } catch {
    // Theme is cosmetic; never throw into a screen.
  }
}

export function storeThemeChoice(choice: ThemeChoice): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, choice);
    }
  } catch {
    // Still apply for this visit when storage is unavailable.
  }
  applyThemeChoice(choice);
  notify();
}

export function clearThemeChoice(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(THEME_KEY);
    }
  } catch {
    // Fall through to clearing the attribute.
  }
  applyThemeChoice("system");
  notify();
}
