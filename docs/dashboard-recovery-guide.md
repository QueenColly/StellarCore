# Dashboard Data Request Recovery Guide

This guide provides a consistent, safe procedure for diagnosing and recovering from failed dashboard panel requests. All steps are read-only by default. Any potentially mutating action is clearly marked.

---

## Dashboard Panel → API Mapping

| Dashboard Panel | API Endpoint | Route File |
|----------------|--------------|------------|
| Anchors | `GET /api/anchors` | `app/api/anchors/route.ts` |
| Corridors | `GET /api/corridors` | `app/api/corridors/route.ts` |
| USDC → BRL Rate | `GET /api/rates?corridor=usdc-us-brl-br` | `app/api/rates/route.ts` |
| Reputation | `GET /api/reputation` | `app/api/reputation/route.ts` |

All endpoints are **read-only**, `force-dynamic`, and return `Cache-Control: no-store`.

---

## Step 1: Identify the Failure Layer

Open the dashboard in a browser with DevTools (Network tab). Look at the failing request.

### Browser Layer Symptoms
- **Blank panel with red alert banner** → `SectionError` component rendered
- **Panel shows "Loading..." indefinitely** → Suspense fallback (no network response yet)
- **Panel shows dashed border with "No X are currently persisted"** → `SectionEmpty` (valid empty state, not an error)
- **Console shows CORS or network error** → Browser/network issue, not API

### API Layer Symptoms (Network tab)
| Status | Code | Meaning |
|--------|------|---------|
| 400 | `missing_corridor` | Corridor query param absent/empty (Rate panel only) |
| 400 | `invalid_corridor` | Corridor slug malformed or >100 chars |
| 400 | `invalid_days` | Days param not integer 1–365 (History endpoint) |
| 400 | `invalid_corridor_slug` | Corridor slug malformed |
| 400 | `invalid_anchor_slug` | Anchor slug malformed |
| 400 | `invalid_pagination` | Pagination params invalid |
| 404 | `anchor_not_found` | No persisted anchor matches slug |
| 404 | `corridor_not_found` | No persisted corridor matches slug |
| 429 | `rate_limited` | >100 requests/minute from same IP |
| 500 | `internal_error` | Database/query failure (secrets masked) |
| 503 | `upstream_unavailable` | Transient dependency failure |

### Persistence Layer Symptoms
- **All panels fail with 500 `internal_error`** → Database connectivity issue
- **Rate/Reputation show stale data** → `X-Evidence-State: stale` header present (fallback active)
- **Anchors/Corridors return empty arrays** → Database has no persisted records (run `npm run bootstrap:registry`)

---

## Step 2: Verify the API Response Directly

Use `curl` to bypass the browser and inspect the raw response.

### Basic Request
```bash
# Anchors
curl -v "https://<deployment>/api/anchors"

# Corridors
curl -v "https://<deployment>/api/corridors"

# Rates (requires corridor param)
curl -v "https://<deployment>/api/rates?corridor=usdc-us-brl-br"

# Reputation
curl -v "https://<deployment>/api/reputation"
```

### Check for Stale Evidence Fallback
```bash
curl -v "https://<deployment>/api/rates?corridor=usdc-us-brl-br" 2>&1 | grep -i "x-evidence"
```

Look for:
- `X-Evidence-State: stale` → Serving last-known-good fallback (primary DB failed)
- `X-Evidence-Generated-At` → When the fallback snapshot was created
- `X-Evidence-Expires-At` → When fallback expires (max 5 min after generation)
- `Warning: 110 - "Response is stale"` → HTTP standard stale warning

### Inspect Response Body
```bash
curl -s "https://<deployment>/api/rates?corridor=usdc-us-brl-br" | jq .
```

Key fields:
- `state`: `"healthy"` | `"insufficient_fresh_sources"` | (error envelope has `error.code`)
- `degraded` object present → stale fallback active
- `evaluatedAt` / `computedAt` → when data was read/calculated

---

## Step 3: Classify and Act

### 400 Bad Request → Client Input Issue
| Code | Fix |
|------|-----|
| `missing_corridor` | Add `?corridor=usdc-us-brl-br` to Rate panel URL |
| `invalid_corridor` | Verify corridor slug format: lowercase, hyphens, ≤100 chars |
| `invalid_days` | Use integer 1–365 for `?days=` param (History) |
| `invalid_pagination` | Check `page` and `limit` params |

**Action**: Correct the query parameter. No server action needed.

---

### 404 Not Found → Missing Persisted Data
| Code | Cause | Resolution |
|------|-------|------------|
| `anchor_not_found` | Anchor never synchronized | Run `npm run bootstrap:registry` |
| `corridor_not_found` | Corridor never synchronized | Run `npm run bootstrap:registry` |

**Action**: ✅ **MUTATING** — Run registry bootstrap (requires DATABASE_URL):
```bash
npm run bootstrap:registry
```
This is idempotent and safe to re-run.

---

### 429 Rate Limited → Too Many Requests
- **Cause**: >100 requests/minute from same IP (per-instance limit)
- **Headers**: `Retry-After: 60` (seconds until window resets)

**Action**: Wait 60 seconds, then refresh. No server action needed.

---

### 500 Internal Error → Database/Query Failure
- **Response**: `{ "error": { "code": "internal_error", "message": "Unable to load X." } }`
- **Secrets**: Never exposed in response (masked in logs)
- **Logs**: Check server logs for `[stellarcore:public-api] <operation> failed (internal_error)`

**Immediate mitigation**: Stale evidence fallback may serve last-known-good data (see Step 2).

**Investigation**:
1. Check database connectivity (Vercel Postgres status)
2. Verify `DATABASE_URL` is set and valid
3. Check for migration drift: `npm run audit:integrity`
4. Review recent deployments for schema changes

**Action**: ✅ **MUTATING** — If migration drift detected, run production migration workflow:
```bash
# Via GitHub Actions: "Deploy production migrations" workflow_dispatch
```

---

### 503 Upstream Unavailable → Transient Dependency
- **Cause**: Temporary database connection pool exhaustion or failover
- **Behavior**: Retries with backoff handled at pool level; fallback may activate

**Action**: Wait and retry. If persistent, check database status.

---

### Stale Fallback Active (`X-Evidence-State: stale`)
- **Meaning**: Primary database read failed; serving verified last-known-good snapshot
- **Age**: Check `X-Evidence-Generated-At` and `snapshotAgeMs` in `degraded` object
- **Expiry**: Snapshots expire after 5 minutes (`STALE_EVIDENCE_MAX_AGE_MS`)
- **Data integrity**: Fallback payload verified via SHA-256 digest; source times validated

**Action**:
1. Verify primary database is healthy
2. Wait for next successful request to refresh snapshot
3. If fallback persists >5 min, investigate database connectivity

---

## Step 4: Collect Sanitized Diagnostics

When reporting an issue, include:

```json
{
  "panel": "anchors|corridors|rates|reputation",
  "timestamp": "2026-10-21T12:00:00.000Z",
  "url": "https://<deployment>/api/rates?corridor=usdc-us-brl-br",
  "status": 500,
  "errorCode": "internal_error",
  "errorMessage": "Unable to read rates.",
  "headers": {
    "cache-control": "no-store",
    "x-evidence-state": "stale",
    "x-evidence-generated-at": "2026-10-21T11:58:00.000Z",
    "x-evidence-expires-at": "2026-10-21T12:03:00.000Z"
  },
  "degraded": {
    "state": "stale",
    "generatedAt": "2026-10-21T11:58:00.000Z",
    "expiresAt": "2026-10-21T12:03:00.000Z",
    "sourceTimes": ["2026-10-21T11:57:30.000Z"],
    "snapshotAgeMs": 120000
  }
}
```

**Redact**: Never include `DATABASE_URL`, `CRON_SECRET`, tokens, or IPs in reports.

---

## Step 5: Safe Retry Procedure

1. **Wait 5–10 seconds** (allows fixed-window rate limiter to reset, transient DB issues to clear)
2. **Refresh the dashboard page** (triggers fresh Suspense boundaries)
3. **If still failing**, run `curl` verification (Step 2)
4. **If 500/503 persists**, check database status and deployment logs
5. **If 404**, run `npm run bootstrap:registry` (mutating, idempotent)
6. **Document** findings using the sanitized format above

---

## Appendix: Dashboard Error Display Reference

| Component | Trigger | UI |
|-----------|---------|-----|
| `SectionError` | API returns non-200 | Red banner with `error.message` |
| `SectionEmpty` | API returns 200 with empty data | Dashed border, muted text |
| `SectionSkeleton` | Suspense fallback (loading) | Pulsing gray boxes |
| `Badge` (negative) | `status: DOWN` / `freshness: invalid` | Red label |
| `Badge` (warning) | `status: DEGRADED` / `freshness: stale` | Yellow label |
| `Badge` (positive) | `status: LIVE` / `freshness: fresh` | Green label |

---

## Quick Reference: Common Commands

```bash
# Verify registry sync
npm run registry:print

# Check configuration coherence
npm run audit:config

# Verify evidence integrity
npm run audit:integrity

# Bootstrap registry (MUTATING, idempotent)
npm run bootstrap:registry

# Verify latest rates locally
npm run verify:latest-rates

# Verify reputation locally
npm run verify:reputation
```

All commands above are read-only except `bootstrap:registry` which is explicitly marked.