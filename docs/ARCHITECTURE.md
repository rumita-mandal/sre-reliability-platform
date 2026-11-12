# Architecture

```
                 +-----------------+
   Clients ----> | Ingress / LB    |
                 +--------+--------+
                          |
              +-----------v-----------+
              |  sre-app (3+ pods)    |  Express API
              |  /api/*  /healthz     |  JSON logs -> stdout
              |  /readyz  /metrics    |
              +-----------+-----------+
                          | scrape /metrics every 15s
              +-----------v-----------+      +----------------+
              |      Prometheus       +----->| Alertmanager   |
              |  recording + alerts   |      | page / ticket  |
              +-----------+-----------+      +----------------+
                          |
              +-----------v-----------+
              |        Grafana        |  RED + SLO dashboard
              +-----------------------+
```

## Design decisions

| Decision | Reason |
|---|---|
| Separate `/healthz` (liveness) and `/readyz` (readiness) | Liveness restarts hung processes; readiness removes a pod from the load balancer without killing it. |
| Readiness flips to 503 on SIGTERM, then a drain delay | Gives the load balancer time to stop routing before the process stops accepting connections, so rollouts drop no requests. |
| Metrics labelled by route *pattern* | Prevents unbounded label cardinality (`/api/items/:id`, not `/api/items/12345`). |
| Multi-window multi-burn-rate alerts | Fast detection of real outages with few false pages (see `docs/SLO.md`). |
| `maxUnavailable: 0` rolling updates + PDB `minAvailable: 2` | Capacity never drops below the safe level during deploys or node drains. |
| Non-root, read-only root filesystem, dropped capabilities | Defence in depth for the container runtime. |
| Structured JSON logs with request IDs | One request can be traced across log lines and clients. |
| In-memory store | Keeps the project dependency-free; the focus is operability. A real service would use a database. |

## Delivery pipeline

1. Pull request: install, syntax check, unit tests, `npm audit` on Node 22 and 24.
2. Image build and smoke test of the running container, non-root check.
3. On merge to `main`: image pushed to GitHub Container Registry (`latest` + short SHA tag).
4. Render (or Kubernetes) deploys the new image; `scripts/smoke.sh` validates the live URL.

## Graceful shutdown timeline

```
SIGTERM
  t=0           readiness -> 503 (LB stops sending new requests)
  t=5s (drain)  server.close(): finish in-flight requests, exit 0
  t=25s max     forced exit (must be < terminationGracePeriodSeconds=30)
```
