import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, dynamic } from "./route";

describe("GET /readyz", () => {
  beforeEach(() => {
    vi.stubEnv("ES_URL", "https://elastic.example.test");
    vi.stubEnv("ES_API_KEY", "test-only-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("authenticates an uncached Elastic ping and succeeds", async () => {
    const ping = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(dynamic).toBe("force-dynamic");
    expect(ping).toHaveBeenCalledTimes(1);
    const [url, options] = ping.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://elastic.example.test");
    expect((options.headers as Record<string, string>).Authorization).toBe("ApiKey test-only-key");
    expect(options.cache).toBe("no-store");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([401, 403, 429, 500, 503])("returns a generic 503 for Elastic HTTP %i", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("sensitive upstream body", { status }));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("hides network errors and credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("https://elastic.example.test test-only-key"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("test-only-key");
    expect(body).not.toContain("elastic.example.test");
  });

  it.each(["ES_URL", "ES_API_KEY"])("fails closed without %s", async (key) => {
    vi.stubEnv(key, "");
    const ping = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(ping).not.toHaveBeenCalled();
  });

  it("aborts a stalled ping before the 3-second probe timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        }),
    );
    const start = Date.now();
    const response = await GET();
    expect(response.status).toBe(503);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});
