# Service Level Objectives

## Service
`sre-reliability-platform` HTTP API (`/api/*`).

## SLIs and SLOs

| SLI | Definition | SLO (30-day window) |
|---|---|---|
| Availability | Share of requests that do **not** return 5xx | **99.5%** |
| Latency | Share of requests served faster than 500 ms (p95 < 500 ms) | **95%** |

Recording rules for these SLIs live in [`monitoring/prometheus/alerts.yml`](../monitoring/prometheus/alerts.yml).

## Error budget

- Availability SLO 99.5% means an **error budget of 0.5%** of requests.
- In a 30-day month that is roughly **3 hours 36 minutes** of full downtime-equivalent.
- Burn rate = (observed error ratio) / 0.005. A burn rate of 1 spends exactly the whole budget over 30 days.

## Alerting policy (multi-window, multi-burn-rate)

| Alert | Condition | Budget consumed if sustained | Action |
|---|---|---|---|
| `ErrorBudgetFastBurn` | 14.4x burn over 5m **and** 1h | 2% of budget in 1 hour | Page on-call |
| `ErrorBudgetSlowBurn` | 6x burn over 30m **and** 6h | 5% of budget in 6 hours | Open ticket |

Using two windows per alert keeps detection fast while avoiding pages for brief blips.
Reference: *Google SRE Workbook, "Alerting on SLOs".*

## Error budget policy

| Budget remaining | Policy |
|---|---|
| > 50% | Normal feature velocity. |
| 25% - 50% | Prioritise reliability work in the next sprint; extra review on risky changes. |
| < 25% | Feature freeze for this service except reliability fixes and security patches. |
| Exhausted | Freeze all non-critical changes until the budget recovers; run a postmortem. |

## Out of scope for the SLO
- Requests returning 4xx (client errors).
- Scheduled maintenance announced in advance.
- `/healthz`, `/readyz` and `/metrics` probe traffic is excluded from business-level reporting where possible.
