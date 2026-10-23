#!/usr/bin/env bash
# Render the chart's Prometheus rules as Argo CD would for dev, then lint them and
# run the unit tests in test/prometheus with promtool (same version as the cluster).
set -euo pipefail
cd "$(dirname "$0")/.."

PROMETHEUS_IMAGE="${PROMETHEUS_IMAGE:-quay.io/prometheus/prometheus:v3.15.0}"
YQ_IMAGE="${YQ_IMAGE:-mikefarah/yq:4}"
out=test/prometheus/.generated
mkdir -p "$out" && rm -f "$out"/*.yml

# One rules file per PrometheusRule (its .spec is a plain Prometheus rules file)
helm template hello-sayings charts/hello-sayings -n hello-sayings \
  -f deploy/environments/dev/values.yaml \
  --api-versions monitoring.coreos.com/v1/PrometheusRule \
  -s templates/prometheusrule.yaml -s templates/prometheusrule-slo.yaml \
  | docker run --rm -i "$YQ_IMAGE" '.spec' \
  | awk -v out="$out" 'BEGIN { f = out "/rules-0.yml" } /^---$/ { f = out "/rules-" ++n ".yml"; next } { print > f }'

# Files go in over stdin rather than a bind mount, which can lag behind freshly
# written files on Docker Desktop
COPYFILE_DISABLE=1 tar -c -C test/prometheus . | docker run --rm -i --entrypoint sh "$PROMETHEUS_IMAGE" -c '
  set -e
  mkdir -p /tmp/work && cd /tmp/work && tar -x
  promtool check rules .generated/*.yml
  promtool test rules ./*.test.yaml
'
