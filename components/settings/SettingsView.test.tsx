import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ENERGY_SETTINGS, LOCAL_STATE_KEY, type LocalState } from "../../lib/contract";
import { createDefaultLocalState, updateLocalState } from "../../lib/client/local-state";
import SettingsView from "./SettingsView";

function stored(): LocalState {
  return JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) ?? "null") as LocalState;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete document.documentElement.dataset.theme;
  window.history.pushState({}, "", "/settings");
  updateLocalState(createDefaultLocalState());
});

describe("SettingsView energy", () => {
  it("persists clamped settings and allows an empty draft before blur", async () => {
    render(<SettingsView />);
    const maxConsecutive = screen.getByLabelText(/Sessions in a row/);
    fireEvent.change(maxConsecutive, { target: { value: "2.6" } });
    await waitFor(() => expect(stored().energy.maxConsecutive).toBe(3));
    fireEvent.change(maxConsecutive, { target: { value: "99" } });
    await waitFor(() => expect(stored().energy.maxConsecutive).toBe(10));
    const minBreak = screen.getByLabelText(/Shortest break that counts/);
    fireEvent.change(minBreak, { target: { value: "" } });
    expect(minBreak).toHaveValue(null);
    expect(stored().energy.minBreakMinutes).toBe(DEFAULT_ENERGY_SETTINGS.minBreakMinutes);
    fireEvent.blur(minBreak);
    expect(minBreak).toHaveValue(DEFAULT_ENERGY_SETTINGS.minBreakMinutes);
    fireEvent.change(minBreak, { target: { value: "30" } });
    await waitFor(() => expect(stored().energy.minBreakMinutes).toBe(30));
  });

  it("resets energy settings to defaults", async () => {
    updateLocalState({ ...createDefaultLocalState(), energy: { ...DEFAULT_ENERGY_SETTINGS, maxConsecutive: 7 } });
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: /Reset energy settings/ }));
    await waitFor(() => expect(stored().energy).toEqual(DEFAULT_ENERGY_SETTINGS));
  });
});

describe("SettingsView theme", () => {
  it("stores explicit dark and removes the attribute for system", () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("radio", { name: /Dark/ }));
    expect(localStorage.getItem("focustrack:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("radio", { name: /System/ }));
    expect(localStorage.getItem("focustrack:theme")).toBe("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    fireEvent.click(screen.getByRole("radio", { name: /Light/ }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("SettingsView clear data", () => {
  it("cancel keeps data and confirm clears plan, notes and theme", async () => {
    const seeded: LocalState = {
      ...createDefaultLocalState(),
      plan: { sessionIds: ["a"], notAttending: [], breaks: [] },
      notes: { a: [{ text: "hi", at: "2026-11-10T11:00:00Z" }] },
      reflections: { a: { prompt: "p", answer: "x", at: "2026-11-10T12:00:00Z" } },
    };
    updateLocalState(seeded);
    localStorage.setItem("focustrack:theme", "dark");
    document.documentElement.dataset.theme = "dark";
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "Clear on-device data" }));
    expect(screen.getByText(/removes your plan, notes, breaks, reflections and energy settings/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(stored().plan.sessionIds).toEqual(["a"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear on-device data" }));
    fireEvent.click(screen.getByRole("button", { name: /Remove all on-device data/ }));
    await waitFor(() => expect(stored()).toEqual(createDefaultLocalState()));
    expect(localStorage.getItem("focustrack:theme")).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("links Play my day preserving a valid ?now=", () => {
    const now = "2026-11-10T11:00-07:00";
    window.history.pushState({}, "", `/settings?now=${encodeURIComponent(now)}`);
    render(<SettingsView />);
    expect(screen.getByRole("link", { name: /Play my day/ })).toHaveAttribute("href", `/demo?now=${encodeURIComponent(now)}`);
    expect(screen.getByText(/stay on this device/)).toBeInTheDocument();
    expect(screen.getByText(/public session IDs/)).toBeInTheDocument();
  });
});
