import { createApp } from "./app.js";
import { DynamoDBStore } from "./dynamodb-store.js";
import { MemoryStore } from "./memory-store.js";
import { instrumentStore, registerStoredGauge } from "./metrics.js";
import { Snapshot, type SayingsStore } from "./store.js";

const PORT = Number(process.env.PORT ?? 3000);
// When set, sayings are stored in this DynamoDB table; otherwise in memory
const TABLE = process.env.SAYINGS_TABLE;
const SNAPSHOT_TTL_MS = Number(process.env.SNAPSHOT_TTL_SECONDS ?? 10) * 1000;

let backend: SayingsStore;
if (TABLE) {
  backend = new DynamoDBStore({ table: TABLE, endpoint: process.env.DYNAMODB_ENDPOINT || undefined });
  console.log(`Using DynamoDB table ${TABLE}`);
} else {
  backend = new MemoryStore();
  console.warn("SAYINGS_TABLE not set: using the in-memory store (data resets on restart)");
}

const store = instrumentStore(backend);
const snapshot = new Snapshot(store, SNAPSHOT_TTL_MS);
registerStoredGauge(snapshot);

const server = createApp({ store, snapshot });
server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

const shutdown = () =>
  server.close(() => {
    if (backend instanceof DynamoDBStore) backend.destroy();
    process.exit(0);
  });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
