# hello-sayings SLOs

> **Status: draft for review.** The SLIs and alerting are implemented. The targets and the error budget policy below are starting proposals, and need agreeing by whoever owns the service.

Everything here is defined in `charts/hello-sayings/values.yaml` under `metrics.slo`. It's rendered by `templates/prometheusrule-slo.yaml`, unit-tested in `test/prometheus/`, and shown on the **hello-sayings SLOs** Grafana dashboard.

## SLIs

Both SLIs are request-based: each one is the share of good requests among all requests. Kubelet probes (`/health`, `/ready`) and Prometheus scrapes (`/metrics`) are excluded. They aren't user traffic, and a failing readiness probe would otherwise burn budget twice.

| SLI | Good request | Source |
|---|---|---|
| **Availability** | Any response that isn't a 5xx (4xx is the client's fault) | `http_requests_total` |
| **Latency** | Served within **250ms**, measured in the app from request start to response end | `http_request_duration_seconds` histogram |

The latency threshold must be one of the histogram's bucket boundaries (0.001 … 1s). The chart refuses to render otherwise, because any other value would quietly round to the nearest bucket.

**What these SLIs miss**, all measured inside the app:
- Failures before the request reaches the pod, such as DNS, the Service, the ingress, or a crash loop. `HelloSayingsDown` covers total outages.
- Requests that are only slow because the client is slow.
- Wrong but successful responses.

A synthetic probe from outside the cluster (for example the Prometheus blackbox exporter) would close the first gap. It's a natural next step.

## SLOs

| SLO | Objective | Error budget | Window |
|---|---|---|---|
| Availability | 99.5% of requests | 0.5% of requests | 30d in the chart; **7d in dev** |
| Latency | 98% of requests ≤ 250ms | 2% of requests | 30d in the chart; **7d in dev** |

**Why dev uses 7 days:** Prometheus in minikube keeps 10 days, on an `emptyDir`, so a 30-day budget can't be measured and every Prometheus restart wipes the history. Lengthen the window only after giving Prometheus 30d+ retention and a persistent volume.

**Where the targets come from:** over the first 7 days on DynamoDB, availability measured 99.83% (34% of the budget used) and latency 98.57% (71% used). That traffic was almost entirely k6 load tests, including `stress` and `spike` runs that deliberately saturate the single pod. Real traffic should do better. Revisit the targets once there's real usage, and decide whether saturation tests should count against the budget, or run against a separate environment.

## Alerting: multi-window, multi-burn-rate

A **burn rate** is how fast the budget is being spent: 1× uses exactly the whole budget over the window, and 10× uses it in a tenth of the window. An alert fires only when **both** windows exceed the burn rate:
- The **long window** shows the problem is big enough to matter.
- The **short window** shows it's still happening, so alerts clear minutes after recovery, not hours.

| Severity | Long / short window | Burn rate | Availability error ratio | Latency slow ratio | Budget lasts (7d window) |
|---|---|---|---|---|---|
| critical (page) | 1h / 5m | 14.4× | > 7.2% | > 28.8% | 11.7h |
| critical (page) | 6h / 30m | 6× | > 3% | > 12% | 28h |
| warning (ticket) | 1d / 2h | 3× | > 1.5% | > 6% | 56h |
| warning (ticket) | 3d / 6h | 1× | > 0.5% | > 2% | 7d |

All tiers share one alert name, `HelloSayingsErrorBudgetBurn`, labelled with `slo`, `severity`, `long_window` and `short_window`. A severe incident trips several tiers at once, so route them to one Alertmanager group by `slo`. These alerts replaced the old fixed-threshold `HelloSayingsHighServerErrorRate` and `HelloSayingsHighLatency`. `HelloSayingsDown`, `HelloSayingsRestarting` and `HelloSayingsHighClientErrorRate` remain, because SLOs don't cover those.

**Low traffic:** in dev, there's only traffic during load tests. With no traffic the ratios have no value and nothing fires, which is correct. When traffic is tiny, a handful of errors can look like a fast burn. If that gets noisy, add a minimum request rate to the alert expressions.

### Recording rules

| Series | Meaning |
|---|---|
| `slo:sli_error:ratio_rate<5m…3d>{slo}` | Bad/total requests over each alerting window |
| `slo:sli_error:ratio_period{slo,window}` | Bad/total over the whole SLO window (evaluated every 5m) |
| `slo:objective:ratio{slo}` / `slo:error_budget:ratio{slo}` | Target and budget (1 − target) |
| `slo:error_budget_remaining:ratio{slo,window}` | 1 = untouched, 0 = spent, < 0 = breached |

Each SLO's alerts sit in the same rule group as its ratios. Rules within a group evaluate in order, so an alert always reads the current evaluation's values; across groups it could read values one interval stale.

## Error budget policy (proposal)

| Budget remaining | What happens |
|---|---|
| > 25% | Ship normally. Spending budget on releases and experiments is the point of having it. |
| 0–25% | Releases still go out, but each needs an explicit note on its reliability risk. Prioritise known reliability fixes. |
| Exhausted (≤ 0) | Feature releases stop until the budget recovers (the 7d window rolls forward). Only reliability fixes, security fixes and rollbacks ship. |
| One incident uses > 20% | Write a postmortem with action items, whatever the remaining budget. |

**Exceptions:**
- Budget spent by a dependency outage (an AWS DynamoDB incident) still counts, because users felt it. Note it in the review, and it can justify not freezing.
- Deliberate load tests against dev spend dev budget. That's acceptable, but it means dev's budget says more about test intensity than reliability.

**Review:** look at the SLO dashboard at the start of each week, and revisit targets and this policy monthly, or after any freeze.

## Changing SLOs

It's an ordinary PR:
1. Edit `metrics.slo` (or the environment's values file).
2. Update the expectations in `test/prometheus/slo.test.yaml` if thresholds move.
3. Run `scripts/test-alert-rules.sh`. CI runs it too.
4. Merge. Argo CD rolls it out.
