# On-call Runbook

Quick triage: open the **Service Overview** Grafana dashboard (`http://localhost:3001` locally), check the
recent deploy history, then follow the matching section below.

General first steps for any page:
1. Acknowledge the alert.
2. Check whether a deploy happened in the last 60 minutes (`kubectl rollout history deploy/sre-app -n sre-platform`).
3. If a recent deploy correlates with the symptom, **roll back first, debug later**.

---

## Service down
**Alert:** `ServiceDown` (Prometheus cannot scrape the target)

1. `kubectl get pods -n sre-platform -l app.kubernetes.io/name=sre-app`
2. Pods in `CrashLoopBackOff`? `kubectl logs <pod> -n sre-platform --previous`
3. Pods `Running` but not `Ready`? `kubectl describe pod <pod> -n sre-platform` and look at probe failures.
4. Check the Service has endpoints: `kubectl get endpoints sre-app -n sre-platform`
5. Roll back if a deploy is the cause: `kubectl rollout undo deploy/sre-app -n sre-platform`

**Mitigation:** roll back, or scale up `kubectl scale deploy/sre-app --replicas=5 -n sre-platform`.

---

## High error rate
**Alerts:** `ErrorBudgetFastBurn`, `ErrorBudgetSlowBurn`

1. In Grafana, check "Requests by status code" to see which codes are spiking.
2. Find the failing route: run in Prometheus
   `topk(5, sum by (route) (rate(http_requests_total{status_code=~"5.."}[5m])))`
3. Search structured logs for the route and `"status":5xx`; use the `request_id` to follow one request.
4. Check `CHAOS_ENABLED` is `false` in production (chaos endpoints intentionally return 500).
5. Mitigate: roll back the latest release, or disable the failing feature.

---

## High latency
**Alerts:** `HighLatencyP95`, `EventLoopLagHigh`

1. Compare p50/p95/p99 panels; a p99-only spike points at a slow route, a p50 shift points at saturation.
2. CPU throttled? `kubectl top pods -n sre-platform` against the 500m limit; check the HPA: `kubectl get hpa -n sre-platform`.
3. High event-loop lag means synchronous work is blocking Node.js; look for recent changes involving loops or JSON parsing.
4. Mitigate: scale out (`kubectl scale`), then fix the hot path.

---

## High memory
**Alert:** `HighMemoryUsage`

1. Watch the "Memory" panel: a steady upward slope that never recovers after load drops indicates a leak.
2. Check restarts: `kubectl get pods -n sre-platform` (OOMKilled shows in `kubectl describe pod`).
3. Check `app_items_total`; the in-memory store is capped by `MAX_ITEMS`.
4. Mitigate: restart pods one at a time (`kubectl rollout restart deploy/sre-app -n sre-platform`), then take a heap snapshot in staging.

---

## Rollback reference

```bash
kubectl rollout history deploy/sre-app -n sre-platform
kubectl rollout undo deploy/sre-app -n sre-platform            # previous revision
kubectl rollout undo deploy/sre-app -n sre-platform --to-revision=3
kubectl rollout status deploy/sre-app -n sre-platform
```

## After the incident
- Write a blameless postmortem using [`POSTMORTEM_TEMPLATE.md`](POSTMORTEM_TEMPLATE.md) within 5 working days.
- Update this runbook with anything that was missing or wrong.
