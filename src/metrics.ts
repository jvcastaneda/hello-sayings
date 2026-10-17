import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import type { Snapshot, SayingsStore } from "./store.js";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

// `route` is the matched route template (e.g. /sayings/:id), never the raw path,
// so label cardinality stays bounded
export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

export const sayingsMutationsTotal = new Counter({
  name: "sayings_mutations_total",
  help: "Sayings created, updated, or deleted",
  labelNames: ["operation"] as const,
  registers: [registry],
});

const storeDuration = new Histogram({
  name: "sayings_store_operation_duration_seconds",
  help: "Storage backend call duration in seconds",
  labelNames: ["operation", "outcome"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

// Wraps every store call in a timer labelled with the operation and success/error
export function instrumentStore(store: SayingsStore): SayingsStore {
  const timed =
    <A extends unknown[], R>(operation: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const end = storeDuration.startTimer({ operation });
      try {
        const result = await fn(...args);
        end({ outcome: "success" });
        return result;
      } catch (err) {
        end({ outcome: "error" });
        throw err;
      }
    };
  return {
    list: timed("list", () => store.list()),
    get: timed("get", (id: string) => store.get(id)),
    put: timed("put", (id: string, text: string) => store.put(id, text)),
    delete: timed("delete", (id: string) => store.delete(id)),
    ping: timed("ping", () => store.ping()),
  };
}

// Reports the snapshot's count, so scrapes don't trigger a table scan more
// often than the snapshot refreshes
export function registerStoredGauge(snapshot: Snapshot) {
  new Gauge({
    name: "sayings_stored",
    help: "Number of sayings currently stored",
    registers: [registry],
    async collect() {
      try {
        this.set((await snapshot.all()).length);
      } catch {
        // Leave the last value; store errors already show in the store metrics
      }
    },
  });
}
