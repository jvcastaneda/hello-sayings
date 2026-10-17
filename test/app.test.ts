import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/memory-store.js";
import { Snapshot, type SayingsStore } from "../src/store.js";

function startApp(store: SayingsStore) {
  const server = createApp({ store, snapshot: new Snapshot(store, 0) });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, url: (path: string) => `http://127.0.0.1:${port}${path}` };
}

describe("API", () => {
  let app: ReturnType<typeof startApp>;
  before(() => {
    app = startApp(new MemoryStore(["seeded"]));
  });
  after(() => app.server.close());

  const put = (id: string, body: string) =>
    fetch(app.url(`/sayings/${id}`), { method: "PUT", body, headers: { "Content-Type": "application/json" } });

  test("GET / returns a random saying", async () => {
    const res = await fetch(app.url("/"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { saying: "seeded", id: "1" });
  });

  test("PUT creates (201) then replaces (200)", async () => {
    assert.equal((await put("x", '{"text":"one"}')).status, 201);
    const res = await put("x", '{"text":" two "}');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: "x", text: "two" });
  });

  test("GET /sayings/:id returns the saying or 404", async () => {
    await put("y", '{"text":"why"}');
    assert.deepEqual(await (await fetch(app.url("/sayings/y"))).json(), { id: "y", text: "why" });
    assert.equal((await fetch(app.url("/sayings/nope"))).status, 404);
  });

  test("DELETE returns 204 then 404", async () => {
    await put("z", '{"text":"zed"}');
    assert.equal((await fetch(app.url("/sayings/z"), { method: "DELETE" })).status, 204);
    assert.equal((await fetch(app.url("/sayings/z"), { method: "DELETE" })).status, 404);
  });

  test("rejects bad input", async () => {
    assert.equal((await put("b", "not json")).status, 400);
    assert.equal((await put("b", '{"txt":"typo"}')).status, 400);
    assert.equal((await put("%E0", '{"text":"a"}')).status, 400);
    assert.equal((await put("b", JSON.stringify({ text: "x".repeat(20_000) }))).status, 413);
    assert.equal((await fetch(app.url("/sayings"), { method: "POST" })).status, 405);
  });

  test("GET /metrics exposes Prometheus metrics", async () => {
    const body = await (await fetch(app.url("/metrics"))).text();
    assert.match(body, /http_requests_total\{method="PUT",route="\/sayings\/:id",status="201"\}/);
  });
});

describe("store failures", () => {
  const broken: SayingsStore = {
    list: () => Promise.reject(new Error("down")),
    get: () => Promise.reject(new Error("down")),
    put: () => Promise.reject(new Error("down")),
    delete: () => Promise.reject(new Error("down")),
    ping: () => Promise.reject(new Error("down")),
  };
  let app: ReturnType<typeof startApp>;
  before(() => {
    app = startApp(broken);
  });
  after(() => app.server.close());

  test("/health stays up but /ready fails", async () => {
    assert.equal((await fetch(app.url("/health"))).status, 200);
    assert.equal((await fetch(app.url("/ready"))).status, 503);
  });

  test("API calls return 500", async () => {
    assert.equal((await fetch(app.url("/sayings/1"))).status, 500);
  });
});
