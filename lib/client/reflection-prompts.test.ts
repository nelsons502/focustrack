import { describe, expect, it } from "vitest";
import { buildReflectionPrompts, findContrast } from "./reflection-prompts";

describe("buildReflectionPrompts", () => {
  it("builds three prompts from the real title with no contrast", () => {
    const { prompts, contrast } = buildReflectionPrompts({
      title: "Scaling  Controllers",
      description: "How controllers reconcile state at scale.",
    });
    expect(contrast).toBeNull();
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toBe(
      "In one sentence, what was the main idea of 'Scaling Controllers'?",
    );
    expect(prompts[1]).toBe("What's one thing you could try at work after this talk?");
    expect(prompts[2]).toBe("What was unclear or worth asking the speaker?");
  });

  it("adds a comparison prompt for an X vs Y description", () => {
    const { prompts } = buildReflectionPrompts({
      title: "T",
      description: "We weigh Helm vs. Kustomize for fleets.",
    });
    expect(prompts).toHaveLength(4);
    expect(prompts[3]).toBe(
      "The talk compared Helm and Kustomize. Which fits your team, and why?",
    );
  });

  it("is deterministic", () => {
    const session = { title: "A", description: "Envoy or Nginx?" };
    expect(buildReflectionPrompts(session)).toEqual(buildReflectionPrompts(session));
  });
});

describe("findContrast", () => {
  it("finds an X or Y pair of capitalised names", () => {
    expect(findContrast("Should you pick Argo or Flux?")).toEqual({
      first: "Argo",
      second: "Flux",
    });
  });

  it("finds multi-word terms around versus", () => {
    expect(findContrast("Service Mesh versus Ambient Mesh in practice")).toEqual({
      first: "Service Mesh",
      second: "Ambient Mesh",
    });
  });

  it("ignores lowercase or and identical terms", () => {
    expect(findContrast("faster or slower builds")).toBeNull();
    expect(findContrast("Helm or helm")).toBeNull();
    expect(findContrast("")).toBeNull();
  });
});

describe("title contrast", () => {
  it("uses a comparison named only in the title", () => {
    const { prompts } = buildReflectionPrompts({ title: "Helm vs Kustomize", description: "Deploy." });
    expect(prompts[3]).toContain("Helm and Kustomize");
  });
});

describe("lowercase versus", () => {
  it("handles names like eBPF vs iptables", () => {
    expect(findContrast("We compare eBPF vs iptables for filtering.")).toEqual({
      first: "eBPF",
      second: "iptables",
    });
  });
});
