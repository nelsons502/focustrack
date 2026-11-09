import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, dynamic } from "./route";

describe("GET /healthz", () => {
  afterEach(() => vi.restoreAllMocks());

  it("succeeds without contacting Elastic", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Liveness must not depend on Elastic");
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(dynamic).toBe("force-dynamic");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
