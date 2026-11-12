# SRE Reliability Platform

[![CI](https://github.com/rumita-mmandal/sre-reliability-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/rumita-mmandal/sre-reliability-platform/actions/workflows/ci.yml)

A production-style Node.js service built to demonstrate **Site Reliability Engineering / DevOps** skills:
observability, SLOs and error budgets, CI/CD, containers, Kubernetes, graceful shutdown and incident response.

> Replace `rumita-mmandal/sre-reliability-platform` in this README, `k8s/deployment.yaml` with your GitHub username and repository name.

## What this demonstrates

| Area | Where |
|---|---|
| REST API with validation and structured JSON logs | `src/` |
| Health checks: liveness `/healthz`, readiness `/readyz` | `src/app.js` |
| Prometheus metrics (RED method) with bounded label cardinality | `src/metrics.js`, `/metrics` |
| Graceful shutdown with connection draining | `src/server.js` |
| Automated tests (Node built-in test runner, no extra deps) | `test/` |
| Multi-stage, non-root Docker image with healthcheck | `Dockerfile` |
| CI pipeline: test matrix, audit, image build, container smoke test, GHCR publish | `.github/workflows/ci.yml` |
| Local observability stack: Prometheus, Alertmanager, Grafana | `docker-compose.yml`, `monitoring/` |
| SLOs, error budget policy, burn-rate alerts | `docs/SLO.md`, `monitoring/prometheus/alerts.yml` |
| Kubernetes: probes, HPA, PDB, NetworkPolicy, security context | `k8s/` |
| Runbook and postmortem template | `docs/` |
| Load testing and chaos injection | `loadtest/k6.js`, `/api/chaos/*` |

## Quick start

Requires Node.js 20+ (22 recommended).

```bash
npm ci
npm test
npm start            # http://localhost:3000
```

```bash
curl localhost:3000/healthz
curl -X POST localhost:3000/api/items -H 'content-type: application/json' -d '{"name":"hello"}'
curl localhost:3000/api/items
curl localhost:3000/metrics
```

## Run the full stack with Docker

```bash
docker compose up -d --build
```

| Service | URL | Login |
|---|---|---|
| App | http://localhost:3000 | |
| Prometheus | http://localhost:9090 | |
| Alertmanager | http://localhost:9093 | |
| Grafana | http://localhost:3001 | admin / admin |

The dashboard **SRE > Service Overview** is provisioned automatically.

### Trigger the alerts (chaos demo)

```bash
make chaos     # sends 300 failing requests to /api/chaos/error
```

Watch the error ratio rise in Grafana and `ErrorBudgetFastBurn` move to *Pending/Firing* in Prometheus (Alerts tab).

## API

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Liveness probe |
| GET | `/readyz` | Readiness probe (503 while shutting down) |
| GET | `/metrics` | Prometheus metrics |
| GET | `/version` | Version, commit, uptime |
| GET | `/api/items` | List items |
| POST | `/api/items` | Create item `{ "name": "..." }` |
| GET | `/api/items/:id` | Get item |
| DELETE | `/api/items/:id` | Delete item |
| GET | `/api/chaos/error` | Returns 500 (only if `CHAOS_ENABLED=true`) |
| GET | `/api/chaos/latency?ms=500` | Delays response (only if `CHAOS_ENABLED=true`) |

## Configuration

All configuration is via environment variables; see [`.env.example`](.env.example).

## Deploy for free on Render

1. Push this repo to GitHub.
2. In Render: **New > Blueprint**, select the repository. `render.yaml` configures a Docker web service with `/readyz` as the health check.
3. After deploy, verify it:

```bash
BASE_URL=https://<your-service>.onrender.com sh scripts/smoke.sh
```

Free instances sleep after inactivity, so the first request can take about a minute.

## Deploy to Kubernetes

```bash
# 1. Set your image in k8s/deployment.yaml (ghcr.io/rumita-mmandal/sre-reliability-platform:latest)
# 2. Apply everything
kubectl apply -k k8s/
kubectl rollout status deploy/sre-app -n sre-platform
```

If the GHCR package is private, make it public (GitHub > Packages > Package settings) or add an `imagePullSecret`.

## Documentation

- [SLOs and error budget policy](docs/SLO.md)
- [On-call runbook](docs/RUNBOOK.md)
- [Architecture and design decisions](docs/ARCHITECTURE.md)
- [Postmortem template](docs/POSTMORTEM_TEMPLATE.md)

## License

MIT
