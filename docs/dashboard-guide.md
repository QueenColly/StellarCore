
# StellarCore Public Dashboard Guide

This guide explains how to navigate StellarCore's public dashboard and interpret the evidence displayed in its four main sections.

The dashboard is available at:

- Local development: `http://localhost:3000/dashboard`
- Deployed environment: `/dashboard` on the configured StellarCore deployment.

StellarCore provides read-only visibility into persisted Stellar anchor metadata, reviewed corridor relationships, indicative-rate observations, and reputation evaluations.

It does not execute transfers or provide a public wallet-connected transaction flow.

## 1. Opening the dashboard

1. Open the StellarCore website.
2. Select **Dashboard** from the primary navigation, or open `/dashboard` directly.
3. Review the introductory explanation and evidence legend.
4. Scroll through the four dashboard sections:
   - Anchors
   - Corridors
   - USDC → BRL Rate
   - Reputation

The dashboard is server-rendered and uses separate loading boundaries for its evidence sections. A loading or error state in one section should not automatically be interpreted as a failure in every other section.

## 2. Understanding the evidence model

Before interpreting individual sections, understand the four different kinds of information presented by StellarCore.

| Evidence area | What it represents | What it does not prove |
| --- | --- | --- |
| Anchors | Persisted anchor metadata and synchronization state. | Current operational availability. |
| Corridors | Reviewed, persisted anchor-to-corridor relationships. | An executable transfer route or guaranteed service. |
| Rates | Persisted indicative-rate observations. | A firm quote or guaranteed exchange rate. |
| Reputation | An evaluation derived from persisted evidence. | An independent endorsement or guarantee of financial trustworthiness. |

These categories are related but are not interchangeable.

For example, an anchor advertising a transfer-related SEP does not establish that it is currently accepting transfers or that a transfer has successfully settled.

## 3. Anchors

The Anchors section displays information about Stellar anchors synchronized into the StellarCore database.

Each anchor card can present:

- Anchor name.
- Home domain.
- Anchor slug.
- Persisted synchronization status.
- Advertised SEP numbers.
- Number of associated corridors.
- Transfer-interface capability metadata.

### Understanding anchor status

The dashboard uses status labels to describe synchronization state.

| Display label | Meaning |
| --- | --- |
| Synced | The persisted synchronization status is `LIVE`. |
| Sync degraded | The persisted synchronization status is `DEGRADED`. |
| Sync failed | The persisted synchronization status is `DOWN`. |
| Sync unknown | The persisted synchronization status is `UNKNOWN`. |

These labels describe the stored synchronization state. They are not a live uptime monitor.

### Understanding advertised SEPs

SEP numbers represent interfaces advertised through the anchor's synchronized metadata.

For example:

- SEP-1 relates to Stellar anchor information and metadata.
- SEP-6 and SEP-24 describe deposit and withdrawal-related interfaces.
- SEP-31 describes cross-border payment-related interfaces.
- SEP-38 relates to anchor-provided pricing information.

An advertised SEP is not proof that the corresponding interface is currently reachable or that a customer transaction can be completed.

The `isTransferCapable` property is derived from the persisted SEP metadata. It should not be interpreted as a verified transfer.

### Where to find more information

The public API provides a more detailed anchor representation:

```text
GET /api/anchors
GET /api/anchors/{slug}
```

See the [Public API Reference](api-reference.md#public-api-reference).

## 4. Corridors

The Corridors section displays persisted corridor relationships.

A corridor identifies a source asset and country alongside a destination asset and country.

The dashboard presents the following information:

| Field | Meaning |
| --- | --- |
| Source | Source asset and country. |
| Destination | Destination asset and country. |
| Anchors | Number of persisted anchor associations for that corridor. |

### Understanding corridor relationships

A corridor represents a reviewed relationship stored in StellarCore.

It does not mean that:

- A transfer route is currently operational.
- An anchor is accepting a transaction.
- A customer can immediately exchange or transfer funds.
- A particular exchange rate is guaranteed.

The anchor count represents persisted associations, not live availability.

### Where to find more information

Use the following public API endpoints:

```text
GET /api/corridors
GET /api/corridors/{slug}
```

The corridor detail endpoint can return the persisted corridor and its associated anchor information.

See the [Public API Reference](api-reference.md#get-apicorridors).

## 5. USDC → BRL Rate Panel

The rate section presents indicative-rate evidence for the featured USDC → BRL corridor.

The implementation uses the corridor slug:

```text
usdc-us-brl-br
```

The panel can display:

- Source and destination assets and countries.
- Evaluation timestamp.
- Latest captured observation timestamp.
- Rate evaluation state.
- Median rate, when supported by sufficient evidence.
- Reviewed candidate configuration.
- Persisted observation count.
- Fresh independent observation count.
- Observation details, including anchor, rate, fee, captured time, freshness, and median eligibility.

### Understanding the rate information

It is important to distinguish three concepts.

**1. Reviewed candidate configuration**

This indicates the rate sources configured for consideration by StellarCore.

Configuration does not establish that a source is operational or currently returning a price.

**2. Persisted observations**

These are individual indicative-rate observations that StellarCore has successfully stored.

An observation is evidence of a recorded rate at a particular time. It is not a firm quote.

**3. Median rate**

The median is published only when the required number of fresh, independent observations is available.

The architectural requirement is:

```text
MIN_FRESH_SOURCES = 2
```

When fewer than two eligible fresh independent observations exist, the API reports:

```json
{
  "state": "insufficient_fresh_sources",
  "medianRate": null
}
```

The example above illustrates the insufficient-evidence state; it is not a captured production response.

### Understanding freshness

The rate panel displays when observations were captured and their freshness classifications.

| State | Interpretation |
| --- | --- |
| Fresh | Observation is within the configured freshness threshold. |
| Stale | Observation is older than the permitted freshness threshold. |
| Future | Observation timestamp is ahead of the evaluation time. |
| Invalid | Observation timestamp does not satisfy the required time validation. |

The default rate freshness threshold is 120 seconds.

Stale or invalid observations should not be interpreted as current market prices.

### Current production limitation

The project README documents one reviewed USDC → BRL source, Zeam, as the current reviewed configuration represented in that branch's documentation.

One source is insufficient to produce a median under the two-independent-source requirement.

This is a documented configuration limitation, not a guarantee about future source availability.

### Where to find more information

```text
GET /api/rates?corridor=usdc-us-brl-br
```

The rate history API is also available:

```text
GET /api/rates/history?corridor=usdc-us-brl-br&days=30
```

The history endpoint accepts a `days` value between 1 and 365.

See the [Public API Reference](api-reference.md) for complete parameters and response contracts.

## 6. Reputation

The Reputation section presents persisted reputation evaluations for anchors.

The evaluation is based on evidence available to StellarCore, rather than a manually assigned endorsement.

A reputation card may display:

- Anchor name.
- Evaluation state.
- Score and score band, when sufficient evidence exists.
- Outcome count.
- Fill-rate metrics.
- Settlement-time metrics.
- Slippage metrics.
- Evaluation timestamp.

### Understanding reputation states

| State | Meaning |
| --- | --- |
| Established | The available evidence satisfies the requirements for publishing a score. |
| Insufficient evidence | The available evidence is not sufficient to publish a score. |
| Not yet evaluated | No persisted evaluation is available for the anchor. |

### Understanding scores

A numerical score and score band are displayed only when the implementation's evidence requirements are met.

The documented minimum outcome threshold is 30 outcomes within the applicable 90-day evaluation window.

When the evidence threshold is not met:

- The score remains `null`.
- The score band remains `null`.
- The dashboard explains that the evidence is insufficient.

Do not interpret a missing score as a zero score or as proof of poor anchor performance.

### Understanding metrics

When available, the dashboard may display:

| Metric | Meaning |
| --- | --- |
| Fill rate 7d | Completed-outcome ratio over seven days. |
| Fill rate 30d | Completed-outcome ratio over thirty days. |
| Fill rate 90d | Completed-outcome ratio over ninety days. |
| Settlement p50 | Median settlement duration based on the implemented 30-day metrics window. |
| Settlement p95 | 95th-percentile settlement duration based on the implemented 30-day metrics window. |
| Slippage p50 | Median slippage based on completed outcomes in the 30-day metrics window. |

A missing metric is displayed as unavailable rather than being replaced with an invented value.

### Important evidence limitation

The existence of the reputation calculation and database model does not establish that StellarCore has a trusted production transfer-outcome ingestion source.

The project documents that transfer outcomes are not inferred from a successful Stellar payment or from an anchor advertising a transfer interface.

Until sufficient authorized evidence exists, an insufficient-evidence state is the correct result.

### Where to find more information

```text
GET /api/reputation
GET /api/reputation/{slug}
```

Read the [Reputation Methodology](reputation-methodology.md) for the detailed calculation, thresholds, weights, and score bands.

## 7. Navigation

The current primary navigation supports:

| Navigation item | Destination |
| --- | --- |
| StellarCore brand | `/` |
| Home | `/` |
| Evidence Model | `/#evidence-model` |
| Dashboard | `/dashboard` |

The Evidence Model navigation item is displayed on the landing page.

The Dashboard navigation item takes visitors to the public dashboard.

Do not assume that every anchor or corridor has an additional clickable dashboard detail page. The public API provides the documented detail endpoints.

## 8. Finding more detailed information

Use these resources when you need more than the dashboard summaries provide.

| What you need | Resource |
| --- | --- |
| Full anchor directory | `GET /api/anchors` |
| Individual anchor information | `GET /api/anchors/{slug}` |
| Full corridor directory | `GET /api/corridors` |
| Individual corridor information | `GET /api/corridors/{slug}` |
| Current persisted rate evidence | `GET /api/rates?corridor={slug}` |
| Rate observation history | `GET /api/rates/history` |
| Reputation directory | `GET /api/reputation` |
| Individual reputation evaluation | `GET /api/reputation/{slug}` |
| API parameters and response structures | [Public API Reference](api-reference.md) |
| Dashboard request troubleshooting | [Dashboard Recovery Guide](dashboard-recovery-guide.md) |
| Reputation calculation details | [Reputation Methodology](reputation-methodology.md) |

All public API routes documented above are read-only GET surfaces.

## 9. Empty, stale, and error states

Not every missing value indicates an application failure.

Examples:

- An empty anchor directory means no anchor records are currently persisted.
- An empty corridor directory means no corridor records are currently persisted.
- An unavailable median may indicate insufficient fresh independent sources.
- An unavailable reputation score may indicate insufficient outcome evidence.
- A stale evidence indicator means the application is serving an eligible last-known-good snapshot under its fallback behavior.
- An API error indicates that the requested operation could not be completed successfully.

For troubleshooting steps, response codes, and recovery procedures, consult the [Dashboard Data Request Recovery Guide](dashboard-recovery-guide.md).

## 10. Responsible interpretation

When using information displayed by StellarCore:

1. Check the evidence category before drawing conclusions.
2. Pay attention to captured and evaluated timestamps.
3. Distinguish persisted configuration from current observations.
4. Do not interpret advertised SEPs as proof of live availability.
5. Do not interpret indicative rates as firm quotes.
6. Do not interpret a corridor association as a verified or executable transfer.
7. Do not interpret a missing reputation score as a numerical score.
8. Consult the relevant API documentation before integrating the data into another application.

StellarCore is designed to make available evidence understandable while preserving the limitations of that evidence.

---

**Further reading:** [Documentation Index](README.md) · [Project README](../README.md) · [Public API Reference](api-reference.md)
