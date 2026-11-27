
# Dashboard Empty, Stale, and Error-State Guide

This guide explains how to interpret missing evidence, empty dashboard sections, stale retained results, loading indicators, and failed requests in StellarCore.

The purpose is to distinguish the absence of persisted evidence from an operational failure.

StellarCore is a read-only evidence platform. A missing value does not automatically mean that the application is broken, and an operational error must not be presented as a successful empty result.

For broader dashboard usage, see the [Dashboard User Guide](dashboard-guide.md).

For detailed troubleshooting and recovery procedures, see the [Dashboard Recovery Guide](dashboard-recovery-guide.md).

## 1. Understanding Dashboard States

The dashboard presents four principal evidence areas:

1. Anchors
2. Corridors
3. Rates
4. Reputation

Each area retrieves persisted evidence through its corresponding public API.

The application distinguishes between:

| State | Meaning |
| --- | --- |
| Loading | The dashboard is waiting for the relevant data request or server-rendered section. |
| Empty | The request succeeded, but no applicable records are available. |
| Stale | An eligible last-known-good snapshot is being served instead of a fresh database result. |
| Error / Unavailable | The application could not successfully retrieve the requested evidence. |
| Insufficient evidence | The request succeeded, but the available evidence does not satisfy a calculation or publication requirement. |

These states describe different conditions.

An empty result is not a failed request, and insufficient evidence is not an application error.

## 2. Dashboard State Matrix

The following matrix summarizes how to interpret each evidence area.

| Evidence area | Empty / missing evidence | Insufficient evidence | Stale retained evidence | Operational error |
| --- | --- | --- | --- | --- |
| Anchors | No anchors are persisted. | Not applicable to the directory listing. | No stale fallback is documented for this endpoint. | The anchor directory could not be loaded. |
| Corridors | No corridors are persisted. | Not applicable to the directory listing. | No stale fallback is documented for this endpoint. | The corridor directory could not be loaded. |
| Rates | No rate observations are persisted. | Fewer than the required fresh independent sources are available for a median. | A verified last-known-good rate response may be returned after an eligible transient database failure. | The rate evidence could not be loaded and no eligible fallback is available. |
| Reputation | An anchor has no persisted evaluation. | A persisted evaluation exists but lacks the evidence required for a score. | A verified last-known-good reputation response may be returned after an eligible transient database failure. | The reputation request failed and no eligible fallback is available. |

The stale fallback behavior is implemented in the API service layer and must not be assumed for endpoints that do not implement it.

## 3. Anchors Section

The Anchors section reads persisted anchor records.

Endpoint:

```text
GET /api/anchors
```

Implementation:

- `components/dashboard/AnchorsSection.tsx`
- `lib/api/anchors.ts`
- `app/api/anchors/route.ts`

### Empty state

When the request succeeds and the anchor directory contains no records, the dashboard displays:

```text
No anchors are currently persisted.
```

This is a successful empty result.

It does not indicate a database failure.

The API can return HTTP 200 with an empty anchors array and a count of zero.

### Operational error

If the API cannot retrieve the anchor directory, the dashboard displays an unavailable state.

The error must not be converted into an empty anchors array.

### Stale evidence

The anchors endpoint does not use the last-known-good stale evidence fallback described for rates and reputation.

Do not describe an empty anchor directory as stale data.

## 4. Corridors Section

The Corridors section displays persisted corridor relationships.

Endpoint:

```text
GET /api/corridors
```

Implementation:

- `components/dashboard/CorridorsSection.tsx`
- `lib/api/corridors.ts`
- `app/api/corridors/route.ts`

### Empty state

When no corridor records are persisted, the dashboard displays:

```text
No corridors are currently persisted.
```

This is a valid empty state.

It does not mean that the API request failed.

The public API returns HTTP 200 with an empty corridors array and a count of zero.

### Operational error

When the corridor directory cannot be retrieved, the section displays an unavailable state.

The dashboard must not silently represent an unsuccessful database request as a successful empty directory.

### Stale evidence

The corridors endpoint does not use the documented last-known-good stale evidence fallback.

An empty corridor result should therefore not be described as stale retained evidence.

## 5. Rates Section

The featured rates panel reads the persisted rate evidence for:

```text
usdc-us-brl-br
```

Endpoint:

```text
GET /api/rates?corridor=usdc-us-brl-br
```

Implementation:

- `components/dashboard/RatePanel.tsx`
- `lib/api/rates.ts`
- `lib/api/staleEvidence.ts`
- `app/api/rates/route.ts`

### Empty observations

When the API request succeeds but no rate observations are available, the panel displays:

```text
No rate observations are currently persisted for this corridor.
```

This means there is no persisted observation to display.

It is not an HTTP error.

### Insufficient fresh sources

A rate median requires at least two fresh independent sources.

When fewer than the required number of eligible observations are available, the API can return:

```json
{
  "state": "insufficient_fresh_sources",
  "medianRate": null
}
```

This represents a successful API response with insufficient evidence for a median.

The panel explains how many fresh independent observations are available relative to the requirement.

An unavailable median must not be replaced with zero or an estimated price.

### Stale retained rate evidence

The rates API can serve a verified last-known-good response when an eligible transient database failure prevents a fresh read.

The response contains stale metadata under:

```text
degraded
```

The response headers can include:

```text
X-Evidence-State: stale
X-Evidence-Generated-At
X-Evidence-Expires-At
X-Evidence-Source-Time
Warning: 110 - "Response is stale"
```

The fallback is time-bounded and validated.

Its maximum age is five minutes.

A stale response is still historical persisted evidence. It must not be described as a fresh observation or a live market quote.

### Operational error

When the primary request fails and no eligible fallback is available, the API returns an error response.

The dashboard must display an unavailable state rather than inventing a median or displaying stale data as fresh.

## 6. Reputation Section

The Reputation section reads persisted reputation evaluations.

Endpoints:

```text
GET /api/reputation
GET /api/reputation/{slug}
```

Implementation:

- `components/dashboard/ReputationSection.tsx`
- `lib/api/reputation.ts`
- `app/api/reputation/route.ts`
- `types/api/reputation.ts`

### Not evaluated

When an anchor has no persisted reputation evaluation, the API returns:

```text
state: not_evaluated
```

The score, score band, evidence, metrics, and computed timestamp are null.

This is a valid evaluation state, not an operational error.

### Insufficient evidence

When a persisted evaluation does not satisfy the scoring requirements, the API returns:

```text
state: insufficient_evidence
```

The score and score band remain null.

This is not the same as a zero score.

The distinction is explained in the [Reputation Evidence Reading Guide](reputation-reading-guide.md).

### Missing metrics

Individual reputation metrics may be null when the corresponding calculation has no qualifying outcomes.

For example, a settlement percentile cannot be calculated without completed outcomes in the relevant metrics window.

A missing metric must not automatically be interpreted as a failed evaluation.

### Stale retained reputation evidence

The reputation API can return verified last-known-good persisted evidence under its stale fallback behavior.

When this happens, the response includes stale metadata under `degraded`.

The presence of a stale fallback must be distinguished from a fresh evaluation.

Do not describe a stale reputation result as a newly computed score.

### Operational error

When a reputation request fails and no eligible fallback is available, the dashboard must display an unavailable state.

An operational failure must not be presented as `not_evaluated` or `insufficient_evidence`.

## 7. Loading, Empty, and Error UI Components

StellarCore uses shared dashboard state components in:

`components/dashboard/SectionStates.tsx`

The available components are:

| Component | Purpose |
| --- | --- |
| `SectionSkeleton` | Indicates that a dashboard section is loading. |
| `SectionEmpty` | Indicates that a request succeeded but no relevant records exist. |
| `SectionError` | Indicates that evidence could not be loaded. |

### Accessibility and interpretation

The shared components distinguish the states through more than color.

- Loading uses `role="status"` and `aria-busy`.
- Empty uses `role="status"`.
- Unavailable uses `role="alert"`.

The rendered UI also exposes a `data-evidence-state` attribute.

These states must remain distinguishable to assistive technologies and users who do not rely on color.

## 8. Retry and Recovery Guidance

The dashboard's error component provides a refresh action through:

`components/dashboard/SectionRetry.tsx`

The action refreshes the current dashboard route using the Next.js router.

Users can follow these steps:

1. Wait briefly if the failure appears temporary.
2. Select **Refresh dashboard data** when the control is displayed.
3. If the problem persists, inspect the corresponding API request.
4. Check the HTTP status and sanitized error response.
5. Consult the [Dashboard Recovery Guide](dashboard-recovery-guide.md) for further diagnostics.

A retry is appropriate for an operational failure.

It does not create missing evidence or guarantee that an insufficient-evidence condition will change.

### Support information

When reporting a problem, include only information that is actually displayed or safely available:

- Affected dashboard section.
- Request endpoint.
- HTTP status, if visible.
- Public error code, if displayed.
- Timestamp of the observed failure.
- Stale evidence headers, if present.

Do not expose:

- Database credentials.
- Authentication tokens.
- API secrets.
- Private customer information.
- Internal stack traces.
- Sensitive server configuration.

Never invent an error reference or display an internal identifier that the application has not exposed.

## 9. Read-Only Evidence Boundaries

All dashboard evidence must be interpreted within StellarCore's read-only model.

The dashboard does not independently establish:

- Live anchor availability.
- A guaranteed transfer route.
- A firm exchange-rate quote.
- A verified transfer.
- Completed off-chain settlement.
- Customer authorization.

Persisted observations, metadata, and reputation calculations must remain clearly distinguished from live transaction operations.

## 10. Related Documentation

| Document | Purpose |
| --- | --- |
| [Dashboard User Guide](dashboard-guide.md) | General dashboard interpretation. |
| [Dashboard Recovery Guide](dashboard-recovery-guide.md) | Detailed request troubleshooting. |
| [Public API Reference](api-reference.md) | HTTP status codes and response contracts. |
| [Reputation Evidence Reading Guide](reputation-reading-guide.md) | Reputation states and unavailable metrics. |
| [Freshness Reading Guide](freshness-reading-guide.md) | Timestamp and freshness interpretation. |
| [Privacy and Custody Boundaries](privacy-custody-boundaries.md) | Read-only and customer-context restrictions. |

## 11. Final Interpretation

Always identify whether a dashboard condition represents missing evidence, insufficient evidence, stale retained evidence, or an operational failure.

These conditions have different meanings and must not be presented as interchangeable states.

A successful empty response is not an error.

An insufficient score is not a zero score.

A stale response is not fresh evidence.

An operational failure is not proof that evidence does not exist.
