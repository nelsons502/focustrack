import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, dynamic } from "./route.ts";

test("liveness succeeds without contacting Elastic", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Liveness must not depend on Elastic");
  });
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(dynamic, "force-dynamic");
});
