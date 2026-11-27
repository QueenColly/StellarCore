# StellarCore Product Scope

## Purpose

StellarCore is a read-only intelligence layer for Stellar anchors. It organizes and presents anchor metadata, reviewed corridor relationships, stored SEP-38 indicative-rate observations, and reputation evaluations derived from evidence persisted by StellarCore.

The public dashboard and public API expose bounded read models. They do not turn reviewed configuration or stored observations into guarantees about an anchor's present operations, a customer's ability to transact, or the settlement of a transfer.

This document defines the current product boundary and distinguishes implemented behavior from possible future work.

## What StellarCore currently provides

### 1. Persisted anchor information

StellarCore maintains a reviewed anchor registry and synchronizes configured entries using the anchor's SEP-1 `stellar.toml` metadata.

The public API exposes persisted anchor fields such as:

- Anchor slug, name, and home domain.
- SEP numbers discovered during synchronization.
- The last persisted synchronization status.
- The number of persisted corridor associations.
- A derived `isTransferCapable` flag based on advertised SEP-6, SEP-24, or SEP-31 support.

These fields describe records and metadata known to StellarCore. A declared SEP interface or a persisted status is not a real-time health check and does not establish that an anchor is currently accepting requests or processing customer transfers.

See the [Public API Reference](api-reference.md#get-api-anchors) and [Dashboard User Guide](dashboard-guide.md#2-anchors).

### 2. Reviewed corridor relationships

StellarCore stores reviewed corridor definitions and anchor-to-corridor associations. Public endpoints expose those persisted relationships and their associated anchor information.

A corridor association means that the relationship is represented in StellarCore's reviewed data. It does not prove that a transfer route is currently operational, that an anchor accepts a transaction, or that a customer can exchange or move funds through that route.

See the [Public API Reference](api-reference.md#get-apicorridors) and [Dashboard User Guide](dashboard-guide.md#4-corridors).

### 3. Stored SEP-38 indicative-rate observations

The scheduled rate process uses reviewed SEP-38 candidate configuration to request indicative prices and stores successful observations as timestamped rate snapshots.

The public rates API reads persisted observations. It reports observation timestamps, freshness classifications, median eligibility, source counts, reviewed candidate-configuration counts, and a median only when the implementation's evidence requirements are met.

An indicative-rate observation is a record of a price observation at a particular time. It is not a firm quote, a guaranteed execution price, or an offer that StellarCore can execute.

See the [Rate Reading Guide](rate-reading-guide.md), [Rate Provenance](rate-provenance.md), and [Public API Reference](api-reference.md#get-apiratescorridorslug).

### 4. Reputation evaluations from persisted evidence

StellarCore contains a reputation calculation and public read models for persisted reputation evaluations. The implementation requires at least 30 outcomes in the 90-day outcome window, at least one synchronized corridor, and at least one latest rate observation before publishing a numerical score.

The project does not currently have a trusted production transfer-outcome ingestion source. A transfer-outcome database model or scoring implementation is not proof that production outcome evidence is being collected. When evidence is absent or insufficient, the API returns a null score and score band, or a `not_evaluated` state when no score row exists.

A published calculation is an evaluation of the persisted inputs available to StellarCore. It is not an independent certification of an anchor's financial, legal, custodial, or operational trustworthiness.

See the [Reputation Methodology](reputation-methodology.md) and [Public API Reference](api-reference.md#get-apireputation).

### 5. Read-only public dashboard and API

The public dashboard and documented public API expose read-only information. The public routes are `GET` endpoints. They do not provide public operations to create transfers, submit customer transfer outcomes, sign transactions, or change the reviewed registry.

Successful public API responses use `Cache-Control: no-store`; see the [Public API Reference](api-reference.md#conventions) for response and rate-limit behavior.

## Evidence categories: how to interpret what you see

| Information shown | What it establishes | What it does not establish |
| --- | --- | --- |
| Reviewed anchor registry entry | An anchor is included in the reviewed registry. | That the anchor is currently online or accepting customers. |
| Persisted synchronization status | The last status recorded by the synchronization process. | Live operational availability at the moment you view it. |
| Advertised SEP capability | The anchor's synchronized metadata declares an interface. | That StellarCore can invoke it with customer authorization or execute a transfer. |
| Persisted corridor association | A reviewed anchor/corridor relationship is stored. | A live, available, or executable transfer route. |
| Indicative-rate observation | A rate observation was captured and persisted at its timestamp. | A firm quote, guaranteed rate, or completed exchange. |
| Median rate | The eligible persisted observations met the configured independent-source threshold at evaluation time. | A guaranteed price or a quote available to a particular customer. |
| Reputation evaluation | A calculation was made from the persisted evidence represented in the evaluation. | A universal reputation score, endorsement, or independent verification of settlement. |
| Transfer-outcome schema | The application can represent outcome records. | A trusted production feed or proof that a particular transfer settled. |

## Important availability and rate limitations

### Configuration is not availability

A reviewed candidate count describes configuration. It does not mean that every candidate is reachable, has returned a successful observation, or is currently operating.

Likewise, an anchor's persisted synchronization status and advertised SEP capabilities must not be described as live operational availability.

### Indicative rates are not firm quotes

StellarCore reads SEP-38 indicative prices. It does not use the firm-quote lifecycle to create a customer quote, reserve a rate, or execute a transfer.

A rate can become stale after capture. Always inspect `capturedAt`, `freshness.state`, and `evaluatedAt` rather than treating a displayed value as a current market price.

### A median requires independent fresh evidence

The implementation requires at least two fresh independent sources (`MIN_FRESH_SOURCES = 2`). When fewer than two eligible sources are available, `medianRate` is `null` and the response state is `insufficient_fresh_sources`.

A null median is an intentional evidence limitation, not a zero rate and not necessarily an API failure.

### Reputation scores are conditional

A numerical reputation score is not guaranteed for every anchor. The score remains unavailable until the implementation's evidence requirements are satisfied. The existence of an anchor, corridor, SEP declaration, or rate observation alone does not establish a score.

## What StellarCore does not do

The current product does not:

- Initiate, sign, submit, route, or execute Stellar payments or anchor transfers.
- Authenticate a customer to an anchor or act on a customer's SEP-6, SEP-24, or SEP-31 transfer session.
- Create firm SEP-38 quotes or guarantee an exchange rate.
- Guarantee that an anchor, corridor, or advertised SEP interface is currently available.
- Independently verify off-chain settlement from a successful on-chain payment or Horizon observation.
- Claim that every anchor has a reputation score.
- Treat a missing score as zero or as proof of poor performance.
- Present a transfer-outcome model as a trusted production evidence feed.

These boundaries describe the current public product and should not be broadened into unsupported claims about every possible infrastructure or data-processing activity.

## Current functionality and possible future work

| Area | Current state | Boundary |
| --- | --- | --- |
| Anchor and corridor directory | Implemented | Reviewed and persisted records are exposed read-only. |
| SEP-38 indicative-rate snapshots | Implemented | Reviewed candidates produce persisted observations; no firm quote or transfer execution. |
| Fresh-source median | Implemented | Requires at least two fresh independent sources. |
| Reputation calculation and read model | Implemented | A score is conditional on sufficient persisted evidence. |
| Trusted production outcome ingestion | Not currently available | The schema and calculation do not constitute a production evidence source. |
| Possible outcome-ingestion boundary | Proposed / future consideration | Requires a legitimate authorized source, privacy and authorization review, and durable provenance before implementation. |
| Public transfer execution or customer transfer management | Not part of the current product | No such capability is promised by the public read-only API. |

The [Outcome Ingestion Architecture RFC](rfc-outcome-ingestion-architecture.md) and [Outcome Webhook Schema RFC](rfc-outcome-webhook-schema.md) describe proposals and trust requirements. RFCs are not evidence that a proposed workflow has shipped or is enabled.

## Example: reading an unavailable median

The following is a **synthetic illustration**, not a live response or a statement about current prices:

```json
{
  "state": "insufficient_fresh_sources",
  "medianRate": null,
  "sourceCount": 1,
  "freshSourceCount": 1,
  "medianRequirement": {
    "minimumFreshIndependentSources": 2
  }
}
```

The response says that one independent source is represented and that the minimum of two fresh independent sources has not been met. It does not say that the exchange rate is zero, that a transfer failed, or that an anchor is unavailable.

## Related documentation

- [Documentation Index](README.md)
- [Project README](../README.md)
- [Public API Reference](api-reference.md)
- [Rate Reading Guide](rate-reading-guide.md)
- [Reputation Methodology](reputation-methodology.md)
- [Privacy and Custody Boundaries](privacy-custody-boundaries.md)
- [System Architecture](architecture.md)

## Sources checked and known limitations

This scope was checked against the `development` branch documentation and implementation, including:

- `README.md` — product overview and documented current production limitations.
- `docs/README.md`, `docs/architecture.md`, `docs/dashboard-guide.md`, and `docs/privacy-custody-boundaries.md`.
- `docs/api-reference.md`, `docs/rate-provenance.md`, and `docs/reputation-methodology.md`.
- `constants/rates.ts`, `lib/rates/freshness.ts`, `lib/rates/median.ts`, `lib/rates/reviewedCandidateConfiguration.ts`, and `lib/api/rates.ts`.
- `lib/reputation/engine.ts` and `prisma/schema.prisma`.

This document describes repository behavior and reviewed documentation, not a live production audit. Runtime availability, current upstream responses, and the presence of newly ingested production outcome evidence must be checked independently. No live API response was used to create the synthetic example above.
