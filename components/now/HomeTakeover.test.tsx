import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../../lib/contract";
import { createDefaultLocalState, updateLocalState } from "../../lib/client/local-state";
import HomeTakeover from "./HomeTakeover";
import { NOW_OPT_OUT_KEY } from "./now-helpers";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

function makeSession(id: string, start: string, end: string): Session {
  return {
    id,
    eventId: "kccncna2026",
    title: `Session ${id}`,
    description: "",
    speakers: [],
    startsAt: `2026-11-10T${start}:00-07:00`,
    endsAt: `2026-11-10T${end}:00-07:00`,
    day: "2026-11-10",
    room: `Room ${id}`,
    venue: "Salt Palace",
    level: "Level 2",
    roomType: "breakout",
    kind: "talk",
    restrictions: [],
    crowdEstimate: "unknown",
    crowdBasis: "",
    noiseEstimate: "unknown",
    noiseBasis: "",
    captions: "unknown",
    sourceUrl: "",
  };
}

beforeEach(() => {
  replace.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/?now=2026-11-10T11%3A15-07%3A00");
  const state = createDefaultLocalState();
  state.plan.sessionIds = ["cur"];
  updateLocalState(state);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (): Promise<Response> => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve([makeSession("cur", "10:30", "11:30")]),
    }) as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("HomeTakeover", () => {
  it("redirects home to Now during a planned talk, keeping the demo time", async () => {
    render(<HomeTakeover />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/now\?now=/)),
    );
  });

  it("stays on home after the session opt-out is set", async () => {
    window.sessionStorage.setItem(NOW_OPT_OUT_KEY, "1");
    render(<HomeTakeover />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(replace).not.toHaveBeenCalled();
  });

  it("stays on home when the in-progress talk is marked not attending", async () => {
    const state = createDefaultLocalState();
    state.plan.sessionIds = ["cur"];
    state.plan.notAttending = ["cur"];
    updateLocalState(state);
    render(<HomeTakeover />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(replace).not.toHaveBeenCalled();
  });
});
