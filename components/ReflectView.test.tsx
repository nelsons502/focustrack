import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_STATE_KEY, type LocalState, type Session } from "../lib/contract";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1", eventId: "kccncna2026", title: "Scaling Controllers",
    description: "Helm vs Kustomize at scale.", speakers: [],
    startsAt: "2026-11-10T16:00:00Z", endsAt: "2026-11-10T16:45:00Z", day: "2026-11-10",
    room: "250 A", venue: null, level: null, roomType: "breakout", kind: "talk",
    restrictions: [], crowdEstimate: "unknown", crowdBasis: "", noiseEstimate: "unknown",
    noiseBasis: "", captions: "unknown", sourceUrl: "https://example.com", ...overrides,
  };
}

function seed(state: Partial<LocalState>) {
  localStorage.setItem(
    LOCAL_STATE_KEY,
    JSON.stringify({
      plan: { sessionIds: [], notAttending: [] },
      notes: {},
      energy: {},
      ...state,
    }),
  );
}

async function renderFresh() {
  vi.resetModules();
  const { default: View } = await import("./ReflectView");
  return render(<View />);
}

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/reflect?now=2026-11-10T11:00-07:00");
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([makeSession()]) } as Response),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReflectView", () => {
  it("shows a calm empty state when nothing has ended", async () => {
    window.history.pushState({}, "", "/reflect?now=2026-11-10T08:00-07:00");
    seed({ plan: { sessionIds: ["s1"], notAttending: [] } });
    await renderFresh();
    expect(await screen.findByText(/No talks have ended yet/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is graded or shared/)).toBeInTheDocument();
  });

  it("does not offer the recap while talks are loading", async () => {
    seed({ plan: { sessionIds: ["s1"], notAttending: [] } });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    await renderFresh();
    expect(screen.getByText(/Loading your talks/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Night-of recap" })).not.toBeInTheDocument();
  });

  it("does not offer the recap when talks fail to load", async () => {
    seed({ plan: { sessionIds: ["s1"], notAttending: [] } });
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await renderFresh();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Night-of recap" })).not.toBeInTheDocument();
  });

  it("shows notes, saves a reflection on the device, and recaps it", async () => {
    seed({
      plan: { sessionIds: ["s1"], notAttending: [] },
      notes: { s1: [{ text: "Operators reconcile", at: "2026-11-10T16:10:00Z" }] },
    });
    await renderFresh();
    fireEvent.click(await screen.findByRole("button", { name: /Reflect on Scaling Controllers/ }));
    expect(await screen.findByText("Operators reconcile")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Which fits your team/ }).getAttribute("value")).toContain("Helm and Kustomize");
    fireEvent.change(screen.getByLabelText(/Your answer/), { target: { value: "Reconcile loops" } });
    fireEvent.click(screen.getByRole("button", { name: "Save on this device" }));
    expect(await screen.findByText("Saved. You can close this.")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) ?? "{}") as LocalState;
    expect(stored.reflections?.s1.answer).toBe("Reconcile loops");

    fireEvent.click(screen.getByRole("button", { name: /Back to today/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Night-of recap" }));
    await waitFor(() => expect(screen.getByText("Reconcile loops")).toBeInTheDocument());
  });

  it("only fetches the schedule, never posts reflections", async () => {
    seed({ plan: { sessionIds: ["s1"], notAttending: [] } });
    await renderFresh();
    fireEvent.click(await screen.findByRole("button", { name: /Reflect on/ }));
    fireEvent.change(screen.getByLabelText(/Your answer/), { target: { value: "private" } });
    fireEvent.click(screen.getByRole("button", { name: "Save on this device" }));
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.every(([url]) => String(url).startsWith("/api/sessions?ids="))).toBe(true);
    expect(calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
});
