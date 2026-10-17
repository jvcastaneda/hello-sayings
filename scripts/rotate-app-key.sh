#!/usr/bin/env bash
# Create a fresh access key for the app's IAM user, store it in the app's
# Kubernetes Secret, roll the pods onto it, then delete the old key(s).
# The key goes from the AWS CLI straight into the Secret: it is never printed,
# written to disk, or stored in Terraform state.
#
# Run with your own (admin) AWS credentials, against the right cluster:
#   scripts/rotate-app-key.sh            # dev
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
IAM_USER="${IAM_USER:-hello-sayings-${ENVIRONMENT}-app}"
NAMESPACE="${NAMESPACE:-hello-sayings}"
SECRET="${SECRET:-hello-sayings-aws}"
DEPLOYMENT="${DEPLOYMENT:-hello-sayings}"

echo "IAM user: $IAM_USER  ->  secret $NAMESPACE/$SECRET  (cluster $(kubectl config current-context))"

old_keys=$(aws iam list-access-keys --user-name "$IAM_USER" --query 'AccessKeyMetadata[].AccessKeyId' --output text)
# IAM allows two keys per user; make room for the new one
if [[ $(wc -w <<<"$old_keys") -ge 2 ]]; then
  echo "User already has 2 keys; delete one first: aws iam delete-access-key --user-name $IAM_USER --access-key-id <id>" >&2
  exit 1
fi

read -r key_id key_secret < <(aws iam create-access-key --user-name "$IAM_USER" \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
echo "Created access key $key_id"

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
# Process substitution keeps the secret out of the process list
kubectl -n "$NAMESPACE" create secret generic "$SECRET" \
  --from-env-file=<(printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n' "$key_id" "$key_secret") \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
unset key_secret
echo "Updated secret $NAMESPACE/$SECRET"

if kubectl -n "$NAMESPACE" get deployment "$DEPLOYMENT" >/dev/null 2>&1; then
  kubectl -n "$NAMESPACE" rollout restart deployment "$DEPLOYMENT"
  # Readiness pings DynamoDB, so a successful rollout proves the new key works
  # (new IAM keys can take a few seconds to become valid)
  if ! kubectl -n "$NAMESPACE" rollout status deployment "$DEPLOYMENT" --timeout=180s; then
    echo "Rollout failed; old key(s) kept: ${old_keys:-none}" >&2
    exit 1
  fi
fi

for k in $old_keys; do
  aws iam delete-access-key --user-name "$IAM_USER" --access-key-id "$k"
  echo "Deleted old access key $k"
done
echo "Done"
