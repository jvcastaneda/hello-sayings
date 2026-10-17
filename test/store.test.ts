import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBStore } from "../src/dynamodb-store.js";
import { MemoryStore } from "../src/memory-store.js";
import { Snapshot, type SayingsStore } from "../src/store.js";

// Every store implementation must pass the same contract
function storeContract(name: string, setup: () => Promise<SayingsStore>, teardown?: () => Promise<void>) {
  describe(`${name} store`, () => {
    let store: SayingsStore;
    before(async () => {
      store = await setup();
    });
    if (teardown) after(teardown);

    test("put reports created then replaced", async () => {
      assert.equal(await store.put("a", "first"), true);
      assert.equal(await store.put("a", "second"), false);
      assert.deepEqual(await store.get("a"), { id: "a", text: "second" });
    });

    test("get of a missing id is undefined", async () => {
      assert.equal(await store.get("missing"), undefined);
    });

    test("list includes stored sayings", async () => {
      await store.put("b", "listed");
      assert.ok((await store.list()).some((s) => s.id === "b" && s.text === "listed"));
    });

    test("delete reports whether something was deleted", async () => {
      await store.put("c", "doomed");
      assert.equal(await store.delete("c"), true);
      assert.equal(await store.delete("c"), false);
      assert.equal(await store.get("c"), undefined);
    });

    test("ping succeeds", async () => {
      await store.ping();
    });
  });
}

storeContract("memory", async () => new MemoryStore([]));

// Runs against DynamoDB Local when DYNAMODB_ENDPOINT is set (CI starts one)
const endpoint = process.env.DYNAMODB_ENDPOINT;
if (endpoint) {
  const table = `sayings-test-${Date.now()}`;
  const admin = new DynamoDBClient({ endpoint });
  let store: DynamoDBStore;
  storeContract(
    "dynamodb",
    async () => {
      await admin.send(
        new CreateTableCommand({
          TableName: table,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      );
      store = new DynamoDBStore({ table, endpoint });
      return store;
    },
    async () => {
      store.destroy();
      await admin.send(new DeleteTableCommand({ TableName: table }));
      admin.destroy();
    },
  );
} else {
  test("dynamodb store", { skip: "set DYNAMODB_ENDPOINT to run against DynamoDB Local" }, () => {});
}

describe("Snapshot", () => {
  test("serves cached data until invalidated", async () => {
    const store = new MemoryStore(["only"]);
    const snapshot = new Snapshot(store, 60_000);
    assert.equal((await snapshot.all()).length, 1);
    await store.put("2", "new");
    assert.equal((await snapshot.all()).length, 1);
    snapshot.invalidate();
    assert.equal((await snapshot.all()).length, 2);
  });

  test("random is undefined when empty", async () => {
    assert.equal(await new Snapshot(new MemoryStore([]), 0).random(), undefined);
  });
});
