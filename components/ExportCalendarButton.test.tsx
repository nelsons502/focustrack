import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../lib/contract";
import {
  createDefaultLocalState,
  updateLocalState,
} from "../lib/client/local-state";
import ExportCalendarButton from "./ExportCalendarButton";

function makeSession(): Session {
  return {
    id: "s1",
    eventId: "kccncna2026",
    title: "Kubernetes Basics",
    description: "",
    speakers: [],
    startsAt: "2026-11-10T09:15:00-07:00",
    endsAt: "2026-11-10T10:00:00-07:00",
    day: "2026-11-10",
    room: "250 A",
    venue: null,
    level: null,
    roomType: "breakout",
    kind: "talk",
    restrictions: [],
    crowdEstimate: "unknown",
    crowdBasis: "",
    noiseEstimate: "unknown",
    noiseBasis: "",
    captions: "unknown",
    sourceUrl: "https://example.test/s1",
  };
}

function storePlan(sessionIds: string[]): void {
  updateLocalState({
    ...createDefaultLocalState(),
    plan: { sessionIds, notAttending: [] },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  storePlan([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExportCalendarButton", () => {
  it("is disabled with an explanation when the plan is empty", async () => {
    render(<ExportCalendarButton />);
    const button = await screen.findByRole("button", {
      name: /add my plan to my calendar/i,
    });
    expect(button).toBeDisabled();
    expect(screen.getByText(/add a session to your plan/i)).toBeInTheDocument();
  });

  it("downloads an .ics file and announces it", async () => {
    storePlan(["s1"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([makeSession()]),
        } as Response),
      ),
    );
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<ExportCalendarButton />);
    const button = await screen.findByRole("button", {
      name: /add my plan to my calendar/i,
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Calendar file ready"),
    );
    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    click.mockRestore();
  });

  it("exports available sessions and announces sessions missing from the schedule", async () => {
    storePlan(["s1", "stale"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([makeSession()]),
        } as Response),
      ),
    );
    const createObjectURL = vi.fn(() => "blob:test");
    Object.assign(URL, { createObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<ExportCalendarButton />);
    const button = await screen.findByRole("button", {
      name: /add my plan to my calendar/i,
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Calendar file ready. 1 session(s) are no longer in the schedule and were left out.",
      ),
    );
    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    click.mockRestore();
  });

  it("shows an error when none of the planned sessions are in the schedule", async () => {
    storePlan(["stale"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        } as Response),
      ),
    );
    render(<ExportCalendarButton />);
    const button = await screen.findByRole("button", {
      name: /add my plan to my calendar/i,
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "None of the sessions in your plan are in the current schedule.",
      ),
    );
  });

  it("shows a friendly error when sessions cannot be loaded", async () => {
    storePlan(["s1"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    render(<ExportCalendarButton />);
    const button = await screen.findByRole("button", {
      name: /add my plan to my calendar/i,
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not be loaded/i),
    );
  });
});
