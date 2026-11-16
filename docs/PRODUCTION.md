# Production Checklist

## Application
- [ ] Frontend build passes
- [ ] Backend tests pass
- [ ] Complete E2E flow passes
- [ ] Auth and tenant isolation verified

## Infrastructure
- [ ] PostgreSQL configured
- [ ] TLS object storage configured
- [ ] Production origins configured
- [ ] Strong JWT secret configured
- [ ] AI provider configured
- [ ] Migrations applied

## Reliability
- [ ] Worker/queue strategy validated for expected scale
- [ ] p50/p95/p99 measured
- [ ] Error rate measured
- [ ] Database connection usage measured
- [ ] Storage throughput measured
- [ ] Queue depth monitored

## Security
- [ ] No secrets committed
- [ ] Dependency/security scans pass
- [ ] CI permissions are least privilege
- [ ] Production deployment protection enabled

---

# The processing worker is a separate service

The API and the worker are **two independently deployed services**. This is the
single most common cause of uploads that never finish.

With `APP_ENV=production`, `INLINE_PROCESSING` defaults to `false`, so the API
deliberately does no heavy work. `POST /datasets/projects/{id}/upload` inserts a
`queued` job row and returns `202`. Nothing else happens until a worker claims
that row.

| Service | Start command | Responsibility |
|---|---|---|
| `rivu-api` (web) | image `CMD`: `alembic upgrade head && uvicorn app.main:app` | Auth, uploads, reads, presigned downloads, job-status API |
| `rivu-worker` (worker) | `python -m app.workers.runner` | Claims jobs, parses the file, profiles, scores quality, writes the report |

`render.yaml` declares both. If you deploy by hand, create the worker service
explicitly with the start command above; a web service alone will leave every
dataset stuck on "Refining your dataset…".

## Verifying the worker is actually running

The API knows whether a worker has been seen recently, because the worker writes
a heartbeat row every poll cycle (2s).

```bash
# 1. Health probe: worker.online must be true
curl -s https://<api-host>/health | jq
# {
#   "status": "healthy",
#   "environment": "production",
#   "worker": { "online": true, "last_seen_seconds_ago": 1 }
# }

# 2. Metrics: the heartbeat gauge must exist and be recent
curl -s https://<api-host>/metrics | grep rivu_worker_last_seen
# rivu_worker_last_seen_timestamp_seconds <unix time>

# 3. Queue depth must be reported (the worker is the only thing that sets it)
curl -s https://<api-host>/metrics | grep rivu_jobs_pending
```

Interpretation:

| Symptom | Meaning |
|---|---|
| `"environment": "development"` | `APP_ENV` is not set to `production` on the web service. In-process processing is silently enabled, which masks the missing worker and is not durable. |
| `"worker": {"online": false}` and no `rivu_worker_last_seen_timestamp_seconds` | No worker has ever checked in. The worker service is missing, crashed, or cannot reach the database. |
| `rivu_jobs_pending` absent entirely | The worker loop has never executed. Same cause as above. |
| `rivu_jobs_pending` present and `> 0` | The worker is alive but the queue is not draining; inspect worker logs. |

## Per-dataset status

`GET /api/v1/datasets/{id}/processing-status` reports the real job state for the
current version:

| `state` | Meaning |
|---|---|
| `queued` | Waiting for a worker; one is online |
| `processing` | A worker is actively processing; `stage` and `progress_pct` are real |
| `completed` | Profile and quality are written |
| `failed` | Terminal. `error` holds the reason; `can_retry` is true while attempts remain |
| `stalled` | Queued or in-flight with **no live worker**. Includes `reason: no_worker` or `reason: worker_lost`. |
| `unknown` | No job exists for this dataset |

A stalled state is deliberately distinct from processing: it means waiting will
not help and the deployment needs attention.

## Retrying

`POST /api/v1/datasets/{id}/retry-processing` returns the job to `queued`,
bounded by `jobs.max_attempts` (default 3). It never fabricates a result: the
worker still has to do the work. Attempts are not reset, so a repeatedly failing
job reaches a terminal failure instead of looping.

## Reprocessing is idempotent

A job interrupted between commits is requeued by stale-job recovery and runs
from the top. The processor deletes any profile, column-profile, quality-report
and quality-issue rows for that version before rewriting them, so a retry cannot
leave duplicate or contradictory rows behind.

## Worker failure modes

| Failure | Behaviour |
|---|---|
| Worker process killed mid-job | Job stays `processing`; stale-job recovery requeues it after the lease window (`STALE_JOB_MINUTES`, default 120). Retries are capped by `max_attempts`. |
| Worker cannot reach PostgreSQL | Poll loop logs `worker_queue_poll_failed` and retries every 5s. No heartbeat is written, so the API reports `worker.online: false`. |
| Worker cannot reach object storage | The job fails with `Failed to parse file: …`; the dataset is marked `failed` and the reason is surfaced in the UI. |
| Retry budget exhausted | Job becomes `failed` with `worker interrupted repeatedly; maximum attempts exceeded`, the dataset is marked `failed`, and `rivu_job_failures_total` increments. |