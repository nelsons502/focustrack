import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "../lib/contract";
import { ACCESSIBILITY_SOURCE_URL } from "../lib/event";
import SessionCard from "./SessionCard";

const LONG = "A long description about the session. ".repeat(10);

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    eventId: "kccncna2026",
    title: "Kubernetes Basics Test Session",
    description: LONG,
    speakers: [],
    startsAt: "2026-11-10T18:15:00Z",
    endsAt: "2026-11-10T19:00:00Z",
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
    sourceUrl: "",
    ...overrides,
  };
}

function renderCard(session: Session, inPlan = false) {
  return render(
    <SessionCard session={session} inPlan={inPlan} onTogglePlan={vi.fn()} />,
  );
}

describe("SessionCard accessibility facts", () => {
  it("shows sourced facts with one shared source link", () => {
    renderCard(makeSession({ captions: "wordly-breakout" }));
    expect(
      screen.getByText("Live captions: Wordly (instructions in room)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reserved accessible seating in every session"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quiet room: Salt Palace, Level 2, 260A"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nearest quiet room/)).not.toBeInTheDocument();
    const links = screen.getAllByRole("link", {
      name: "KubeCon inclusion & accessibility page",
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", ACCESSIBILITY_SOURCE_URL);
  });

  it("does not claim captions when unconfirmed", () => {
    renderCard(makeSession());
    expect(screen.getByText("Captions: not confirmed")).toBeInTheDocument();
    expect(screen.queryByText(/Live captions/)).not.toBeInTheDocument();
  });

  it("mentions 260B only inside the quiet rooms disclosure", () => {
    const { container } = renderCard(makeSession());
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.textContent).toMatch(/260B/);
    const outside = Array.from(container.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(outside.join(" ")).not.toMatch(/260B/);
  });

  it("labels estimates with their basis", () => {
    renderCard(
      makeSession({
        crowdEstimate: "large",
        crowdBasis: "ballroom",
        noiseEstimate: "loud",
        noiseBasis: "open expo floor",
      }),
    );
    expect(
      screen.getByText("Crowd: likely large (estimate: ballroom)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Noise: likely loud (estimate: open expo floor)"),
    ).toBeInTheDocument();
  });

  it("never reads small or quiet when unknown", () => {
    const { container } = renderCard(makeSession());
    expect(screen.getByText("Crowd: unknown")).toBeInTheDocument();
    expect(screen.getByText("Noise: unknown")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bsmall\b|\bquiet\b(?! room)/i);
  });

  it("shows unknown when an estimate has no basis", () => {
    renderCard(makeSession({ crowdEstimate: "large", noiseEstimate: "loud" }));
    expect(screen.getByText("Crowd: unknown")).toBeInTheDocument();
    expect(screen.getByText("Noise: unknown")).toBeInTheDocument();
  });

  it("shows unknown even if a basis is present without an estimate", () => {
    renderCard(makeSession({ crowdBasis: "ballroom" }));
    expect(screen.getByText("Crowd: unknown")).toBeInTheDocument();
  });
});

describe("SessionCard interactions", () => {
  it("expands and collapses the description", () => {
    renderCard(makeSession());
    const toggle = screen.getByRole("button", {
      name: "Show full description",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const controlled = document.getElementById(
      toggle.getAttribute("aria-controls") ?? "",
    );
    expect(controlled).not.toBeNull();
    expect(controlled).toHaveClass("card-desc-clamped");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(controlled).not.toHaveClass("card-desc-clamped");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("offers expansion even for short descriptions", () => {
    renderCard(makeSession({ description: "Short." }));
    expect(
      screen.getByRole("button", { name: "Show full description" }),
    ).toBeInTheDocument();
  });

  it("reflects plan state with aria-pressed", () => {
    const { rerender } = renderCard(makeSession(), false);
    expect(screen.getByRole("button", { name: /Add to plan/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(
      <SessionCard session={makeSession()} inPlan onTogglePlan={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Add to plan/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("SessionCard summaries", () => {
  it("prefers the reviewed summary and labels it", () => {
    renderCard(makeSession({ plainSummary: "A reviewed summary.", autoSummary: "This talk covers Kubernetes basics." }));
    expect(screen.getByText("Plain-language summary (reviewed):")).toBeInTheDocument();
    expect(screen.queryByText(/AI summary \(automatic, not reviewed\)/)).not.toBeInTheDocument();
  });

  it("labels a passing automatic summary as not reviewed", () => {
    renderCard(makeSession({ autoSummary: "This talk covers Kubernetes basics." }));
    expect(screen.getByText("AI summary (automatic, not reviewed):")).toBeInTheDocument();
    expect(screen.getByText(/This talk covers Kubernetes basics\./)).toBeInTheDocument();
  });

  it("shows nothing when the automatic summary fails the guardrail", () => {
    renderCard(makeSession({ autoSummary: "This talk is run by Zorblax engineers." }));
    expect(screen.queryByText(/AI summary/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Zorblax/)).not.toBeInTheDocument();
  });
});
