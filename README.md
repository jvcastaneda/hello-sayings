# hello-sayings

A small TypeScript HTTP API for sayings, backed by DynamoDB, with Prometheus metrics, deployed to Kubernetes by Argo CD.

```
GET    /                 random saying
GET    /sayings          list all
GET    /sayings/:id      get one
PUT    /sayings/:id      create (201) or replace (200), body {"text": "..."}
DELETE /sayings/:id      delete (204)
GET    /health           liveness
GET    /ready            readiness (checks DynamoDB)
GET    /metrics          Prometheus metrics
```

## Layout

| Path | What |
|---|---|
| `src/`, `test/` | The app and its tests |
| `charts/hello-sayings/` | Helm chart (incl. ServiceMonitor, PrometheusRule, Grafana dashboard) |
| `infra/bootstrap/` | One-time, admin-applied: Terraform state bucket, GitHub OIDC, CI roles |
| `infra/modules/hello-sayings/` | DynamoDB table + the app's least-privilege IAM user |
| `infra/envs/dev/` | The dev environment (one directory per environment) |
| `deploy/argocd/` | Argo CD applications (app of apps) |
| `deploy/environments/dev/values.yaml` | Helm values for dev |
| `scripts/` | Argo CD bootstrap and app key rotation |

## How changes flow

Everything goes through a pull request to `main`:

| Change | On the PR | After merge |
|---|---|---|
| App code (`src/`) | Typecheck, tests (incl. DynamoDB Local), image build | Tag `vX.Y.Z` to release it (below) |
| Chart (`charts/`) | `helm lint` + render with dev values | Ships with the next release |
| Infrastructure (`infra/`) | `fmt`, `validate`, `plan` posted as a PR comment | `apply`, after approval on the `production` environment |
| Dev config (`deploy/`) | Chart render with dev values | Argo CD syncs it within ~3 min |

**Releasing:** push a tag such as `v0.2.0`. The release workflow publishes the image and chart to GHCR, then opens a "Deploy 0.2.0 to dev" PR. Merge that PR and Argo CD rolls it out. To roll back, revert the PR.

**Adding an environment:** copy `infra/envs/dev` to `infra/envs/<env>` and change its state key and `environment`, then add the environment to the Terraform workflow matrix. Add a matching `deploy/environments/<env>/values.yaml` and Argo CD app.

## Security model

- **CI holds no AWS keys.** GitHub Actions gets short-lived credentials through OIDC. The plan role is read-only, can only be assumed from pull requests, and can't read table data beyond the seed items. The apply role can only be assumed by jobs in the `production` environment.
- **CI can't widen its own access.** The OIDC trust and the CI roles live in `infra/bootstrap`, which only an admin applies, from a laptop.
- **The app's IAM user is boxed in twice:** an inline policy allows only `GetItem`/`PutItem`/`DeleteItem`/`Scan` on its own table, and CI can only create the user with the bootstrap permissions boundary attached. The apply role also can't remove that boundary or create access keys.
- **The app's access key never touches Terraform state, git, or CI.** `scripts/rotate-app-key.sh` creates it with your credentials and writes it straight into the `hello-sayings-aws` Secret.
- If this moves to EKS, drop the IAM user and Secret in favour of IRSA or Pod Identity (`aws.existingSecret: ""` plus a service account annotation). The app needs no code changes, because it uses the SDK's default credential chain.

## One-time setup

1. **Bootstrap AWS** (admin credentials):
   ```bash
   cd infra/bootstrap
   terraform init && terraform apply
   # Move its state into the bucket it just made: uncomment the backend block in versions.tf, then
   terraform init -migrate-state -backend-config="bucket=$(terraform output -raw state_bucket)"
   ```
2. **Configure GitHub** with the bootstrap outputs:
   ```bash
   gh variable set TF_STATE_BUCKET --body "$(terraform output -raw state_bucket)"
   gh variable set AWS_PLAN_ROLE_ARN --body "$(terraform output -raw plan_role_arn)"
   gh variable set AWS_APPLY_ROLE_ARN --body "$(terraform output -raw apply_role_arn)"
   gh variable set APP_PERMISSIONS_BOUNDARY_ARN --body "$(terraform output -raw app_permissions_boundary_arn)"
   ```
   Then, in the repository settings:
   - Create a `production` environment with yourself as required reviewer, limited to the `main` branch.
   - Under Actions → General, enable "Allow GitHub Actions to create and approve pull requests".
   - Protect `main` so the CI checks must pass.
3. **Apply dev infrastructure** by merging a PR that touches `infra/` (or running the Terraform workflow manually), then approve the `production` deployment.
4. **Create the app's key:** `scripts/rotate-app-key.sh`
5. **Install Argo CD:** `scripts/bootstrap-argocd.sh`

## Operations

- **Rotate the app key:** run `scripts/rotate-app-key.sh`. It creates a new key, rolls the pods onto it, confirms they pass readiness (which hits DynamoDB), and only then deletes the old key.
- **Run locally:** `npm run build && npm start` uses the in-memory store. Point it at DynamoDB Local with
  `docker run -p 8000:8000 amazon/dynamodb-local` and `SAYINGS_TABLE=... DYNAMODB_ENDPOINT=http://localhost:8000`.
- **Tests:** `npm test`. Set `DYNAMODB_ENDPOINT` to also run the DynamoDB store tests.

## Costs

The table uses on-demand billing, so you pay per request; idle cost is about $0 plus storage and PITR. Heavy load tests cost money. `GET /sayings` scans the whole table, so the k6 `stress` and `spike` profiles cost the most. `GET /` is served from a 10-second in-process snapshot and doesn't scan per request.
