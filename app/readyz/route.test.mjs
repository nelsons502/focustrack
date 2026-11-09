import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, dynamic } from "./route.ts";

function credentials(t) {
  const original = { ES_URL: process.env.ES_URL, ES_API_KEY: process.env.ES_API_KEY };
  process.env.ES_URL = "https://elastic.example.test";
  process.env.ES_API_KEY = "test-only-key";
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("readiness authenticates an uncached Elastic ping and succeeds", async (t) => {
  credentials(t);
  const ping = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(dynamic, "force-dynamic");
  assert.equal(ping.mock.callCount(), 1);
  const [url, options] = ping.mock.calls[0].arguments;
  assert.equal(url, "https://elastic.example.test");
  assert.equal(options.headers.Authorization, "ApiKey test-only-key");
  assert.equal(options.cache, "no-store");
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
});

for (const status of [401, 403, 429, 500, 503]) {
  test(`readiness returns a generic 503 for Elastic HTTP ${status}`, async (t) => {
    credentials(t);
    t.mock.method(globalThis, "fetch", async () => new Response("sensitive upstream body", { status }));
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable" });
  });
}

test("readiness hides network errors and credentials", async (t) => {
  credentials(t);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error(`${process.env.ES_URL} ${process.env.ES_API_KEY}`);
  });
  const response = await GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

for (const key of ["ES_URL", "ES_API_KEY"]) {
  test(`readiness fails closed without ${key}`, async (t) => {
    credentials(t);
    delete process.env[key];
    const ping = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable" });
    assert.equal(ping.mock.callCount(), 0);
  });
}

test("readiness aborts a stalled ping within the probe deadline", async (t) => {
  credentials(t);
  t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  // Keep Node alive while AbortSignal.timeout's unreferenced timer runs.
  const guard = setTimeout(() => {}, 4000);
  t.after(() => clearTimeout(guard));
  const start = Date.now();
  const response = await GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
  assert.ok(Date.now() - start < 3000, "Ping must finish before the 3-second readiness probe timeout");
});
