#!/usr/bin/env bash
# One-time: install Argo CD into the current cluster and hand it the root app.
# After this, deploys happen by merging PRs that change deploy/.
set -euo pipefail
cd "$(dirname "$0")/.."

ARGOCD_CHART_VERSION="${ARGOCD_CHART_VERSION:-10.10.5}"

echo "Cluster: $(kubectl config current-context)"

helm repo add argo https://argoproj.github.io/argo-helm >/dev/null
helm repo update argo >/dev/null
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd --create-namespace \
  --version "$ARGOCD_CHART_VERSION" \
  --set configs.params."server\.insecure"=true \
  --wait

# Argo CD takes over the app from a previous `helm install`. Dropping only Helm's
# release record keeps the running resources (no downtime) and stops a later
# `helm uninstall` from deleting what Argo CD now manages.
if helm -n hello-sayings status hello-sayings >/dev/null 2>&1; then
  echo "Handing the existing Helm release over to Argo CD"
  kubectl -n hello-sayings delete secret -l owner=helm,name=hello-sayings
fi

kubectl apply -f deploy/argocd/root.yaml

cat <<MSG

Argo CD is running. To open the UI:
  kubectl -n argocd port-forward svc/argocd-server 8080:80
  open http://localhost:8080   (user: admin)
  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
MSG
