# StellarCore Public Read-Only API Examples

Runnable, zero-dependency Node.js examples demonstrating how to consume StellarCore's public read-only GET APIs using Node.js 22 built-in `fetch`.

## Principles & Guarantees

- **Dependency-Free**: Uses only standard Node.js built-ins (`fetch`, `URLSearchParams`, `node:test`, `node:assert/strict`).
- **Read-Only GET Routes Only**: Calls only documented public GET endpoints; no mutation methods (`POST`, `PUT`, `DELETE`), no private credentials or signing keys.
- **Input Validation**: Validates corridor/anchor slugs and history-day bounds before sending HTTP requests.
- **Honest Evidence Handling**: Does not mask missing or degraded evidence. Null medians, zero samples, and unrated scores are displayed transparently rather than claiming false success.
- **Error & Rate-Limit Resilience**: Properly handles HTTP 400, 404, 429 (`Retry-After`), and 5xx responses with typed `ApiError` instances.

---

## Allowlisted Endpoints

| Resource | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| **Anchors** | `GET` | `/api/anchors` | Directory of registered anchors |
| **Anchor Detail** | `GET` | `/api/anchors/:slug` | Specific anchor metadata |
| **Corridors** | `GET` | `/api/corridors` | Directory of payment corridors |
| **Corridor Detail** | `GET` | `/api/corridors/:slug` | Specific corridor metadata |
| **Current Rates** | `GET` | `/api/rates?corridor=:slug` | Current corridor median exchange rates |
| **Rate History** | `GET` | `/api/rates/history?corridor=:slug&days=:n` | Historical exchange rate observations |
| **Reputation** | `GET` | `/api/reputation` | Global anchor reputation summary |
| **Anchor Reputation** | `GET` | `/api/reputation/:slug` | Anchor reputation score and factor evidence |

---

## Environment Configuration

By default, examples connect to `http://localhost:3000`. You can configure the target base URL using the `STELLARCORE_API_BASE_URL` environment variable:

```bash
export STELLARCORE_API_BASE_URL="http://localhost:3000"
```

---

## Running the Examples

### 1. Anchors
```bash
# Query list of anchors
node examples/public-readonly-api/get-anchors.js

# Query specific anchor by slug
node examples/public-readonly-api/get-anchors.js circle
```

### 2. Corridors
```bash
# Query list of corridors
node examples/public-readonly-api/get-corridors.js

# Query specific corridor by slug
node examples/public-readonly-api/get-corridors.js usdc-brl
```

### 3. Rates
```bash
# Query all rates or specific corridor
node examples/public-readonly-api/get-rates.js usdc-brl
```

### 4. Rate History
```bash
# Query rate history for a corridor over 30 days (default)
node examples/public-readonly-api/get-rate-history.js usdc-brl

# Query rate history for a specific number of days (1-365)
node examples/public-readonly-api/get-rate-history.js usdc-brl 14
```

### 5. Reputation
```bash
# Query global reputation directory
node examples/public-readonly-api/get-reputation.js

# Query anchor reputation by slug
node examples/public-readonly-api/get-reputation.js circle
```

---

## Running the Test Suite

The test suite uses Node.js 22 built-in test runner with mocked HTTP fixtures so no live server or external network access is needed:

```bash
node --test examples/public-readonly-api/test/public-readonly-api.test.js
```

---

## Illustrative Sample Outputs (Synthetic Data)

> **Note:** The outputs below are illustrative examples using synthetic mock data.

### Sample: Rate History Output
```text
[INFO] Querying rate history for corridor 'usdc-brl' over 30 day(s)...
[SUCCESS] Status: 200
Retrieved 2 history point(s):
  [2026-11-20T00:00:00Z] Rate: 5.42
  [2026-11-21T00:00:00Z] Rate: 5.45

Full JSON Payload:
{
  "corridor": "usdc-brl",
  "days": 30,
  "history": [
    { "timestamp": "2026-11-20T00:00:00Z", "rate": 5.42 },
    { "timestamp": "2026-11-21T00:00:00Z", "rate": 5.45 }
  ]
}
```

### Sample: Degraded / Insufficient Evidence Output
```text
[INFO] Querying rate history for corridor 'usdc-zar' over 30 day(s)...
[SUCCESS] Status: 200
[WARNING] Response indicates degraded or stale history observations.
Retrieved 0 history point(s):
  (No observation points available for this corridor and window)
```

### Sample: Rate Limit (429) Handling
```text
[ERROR] Failed to fetch rate history: Rate limit exceeded (429) on http://localhost:3000/api/rates/history?corridor=usdc-brl&days=30. Retry after: 60s
  Status code: 429 (RATE_LIMITED)
```
