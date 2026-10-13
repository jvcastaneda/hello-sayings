import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { countSayings } from "./sayings.js";

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

new Gauge({
  name: "sayings_stored",
  help: "Number of sayings currently stored",
  registers: [registry],
  collect() {
    this.set(countSayings());
  },
});
