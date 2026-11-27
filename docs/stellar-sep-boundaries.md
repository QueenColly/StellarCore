
# Stellar SEP Integration Boundaries

This document explains the Stellar Ecosystem Proposals (SEPs) that StellarCore currently uses, how their functionality relates to the application, and the boundaries that must be preserved when interpreting their capabilities.

StellarCore is a read-only intelligence layer for Stellar anchors. It uses selected SEP functionality to discover anchor metadata and obtain reviewed indicative-rate observations.

SEP support must not be interpreted as proof of live anchor availability, verified transfers, customer authorization, or firm quotes.

## 1. Overview of SEP Functionality

StellarCore's relevant SEP integrations include:

| SEP | Purpose | StellarCore usage |
| --- | --- | --- |
| SEP-1 | Stellar anchor information and metadata | Discovers anchor metadata through `stellar.toml`. |
| SEP-38 | Anchor-provided pricing information | Reads reviewed indicative-price observations. |
| SEP-10 | Web authentication protocol | Provides an authentication boundary and verification functionality. |

Other advertised SEP capabilities may be persisted as anchor metadata.

Their presence does not mean StellarCore implements or operates every associated transfer workflow.

## 2. SEP-1: Anchor Metadata Discovery

SEP-1 defines the Stellar anchor information file commonly published as:

```text
https://anchor.example.com/.well-known/stellar.toml
```

StellarCore uses this file to discover metadata about reviewed anchors.

The implementation is located in:

- `lib/stellar/sep1.ts`
- `lib/stellar/anchors.ts`
- `lib/stellar/anchorRegistry.ts`
- `types/anchor.ts`

### Information discovered

The SEP-1 parser reads and validates supported metadata, including:

- Organization information.
- Network passphrase.
- Advertised endpoints.
- Supported SEP numbers.
- Asset information.
- Optional signing-key metadata.

The discovery process normalizes supported SEP identifiers and persists the reviewed anchor information through the registry synchronization workflow.

### Understanding advertised capabilities

SEP metadata can indicate that an anchor advertises a particular interface.

For example:

| Advertised interface | What the metadata indicates |
| --- | --- |
| SEP-6 | A transfer-server interface is advertised. |
| SEP-10 | A web-authentication endpoint is advertised. |
| SEP-24 | An interactive transfer-server interface is advertised. |
| SEP-31 | A direct-payment interface is advertised. |
| SEP-38 | An anchor quote-server endpoint is advertised. |

These labels describe discovered metadata.

They do not independently prove that:

- The endpoint is currently reachable.
- The anchor is accepting new customer transactions.
- The advertised service is available for a particular customer.
- A transfer can be completed.
- A transfer has settled successfully.

### Transfer capability metadata

StellarCore derives its transfer-interface capability indicator from the persisted SEP metadata.

The relevant implementation is:

`lib/stellar/anchors.ts`

The public API exposes the derived `isTransferCapable` property.

This is a metadata classification, not a verified transfer status.

## 3. SEP-38: Indicative Pricing

SEP-38 defines an anchor-provided pricing interface.

StellarCore uses selected SEP-38 functionality to discover pricing capabilities and obtain indicative-price observations from explicitly reviewed sources.

Relevant implementation files include:

- `lib/stellar/sep38.ts`
- `lib/rates/liveRateSource.ts`
- `lib/rates/normalize.ts`
- `lib/rates/median.ts`
- `constants/rates.ts`

### SEP-38 endpoints used by the integration

The client supports the following SEP-38 operations:

| Endpoint | Purpose |
| --- | --- |
| `/info` | Reads supported assets and delivery-method information. |
| `/prices` | Discovers supported asset-pair pricing information. |
| `/price` | Retrieves an indicative price for a requested asset pair and amount. |

StellarCore's reviewed live-rate source uses the `/prices` and `/price` flow to validate and obtain indicative pricing evidence.

### Indicative prices are not firm quotes

An indicative price is an observation of the pricing information returned by an anchor.

It does not guarantee that:

- The same price will remain available.
- The anchor will accept a subsequent transaction.
- The price represents an executable offer.
- The customer can complete a transfer at that price.
- The anchor has committed to a final settlement amount.

StellarCore does not use the firm-quote lifecycle as part of its reviewed rate-refresh workflow.

Although the SEP-38 client contains firm-quote request and response functionality, that capability must not be confused with the production indicative-rate workflow.

### Median eligibility

StellarCore does not automatically publish a median merely because an anchor advertises SEP-38.

A rate source must be part of the reviewed configuration and produce a valid persisted observation.

The median calculation additionally requires the minimum number of fresh independent sources.

The configured architectural minimum is:

```text
MIN_FRESH_SOURCES = 2
```

When the requirement is not met, the public API returns an insufficient-source state and a null median.

See the [Rate Reading Guide](rate-reading-guide.md) for the interpretation of observations, eligibility, and median availability.

## 4. SEP-10: Authentication Boundary

SEP-10 defines a web-authentication protocol for Stellar anchors.

StellarCore contains SEP-10 authentication functionality in:

- `lib/stellar/sep10.ts`
- `lib/stellar/auth.ts`
- `types/stellarAuth.ts`

The implementation supports the authentication challenge workflow.

At a high level, the process involves:

1. Obtaining an authentication challenge from the anchor.
2. Validating the challenge against the configured identity and network.
3. Signing the challenge through the configured signing interface.
4. Submitting the signed challenge to the authentication endpoint.
5. Parsing and validating the returned authentication token claims.

The implementation includes checks for challenge identity, endpoint configuration, response validation, and signing failures.

### What SEP-10 support does not authorize

SEP-10 support does not mean that StellarCore automatically has authorization to access every customer-related anchor operation.

An authentication token must be interpreted within its configured identity, scope, and protocol context.

In particular, the existence of SEP-10 authentication code does not establish that StellarCore:

- Has authorization to inspect arbitrary customer transfer histories.
- Can access private customer accounts or transfer instructions.
- Can initiate deposits or withdrawals on behalf of users.
- Can execute customer transfers.
- Can independently verify off-chain settlement.

SEP-10 authentication must not be used as a justification for bypassing customer authorization or privacy boundaries.

## 5. Transfer-Related SEP Boundaries

StellarCore may discover and persist advertised SEP-6, SEP-24, and SEP-31 capabilities through SEP-1 metadata.

These interfaces are associated with transfer-related functionality.

However, advertising an interface is not the same as implementing its full customer transaction lifecycle.

The current public StellarCore API is read-only.

The public API does not expose customer transfer initiation, deposit submission, withdrawal submission, or transfer-history retrieval.

The project also does not infer verified transfer outcomes from an anchor advertising a transfer-related SEP.

### Transfer outcome evidence

The reputation system has a transfer-outcome data model and scoring implementation.

However, the existence of these structures does not establish a trusted production outcome-ingestion source.

A successful on-chain payment alone must not be treated as proof of completed off-chain settlement.

Any future outcome-ingestion capability requires an appropriate authorized source, provenance, and privacy controls.

See:

- [Privacy and Custody Boundaries](privacy-custody-boundaries.md)
- [Reputation Methodology](reputation-methodology.md)
- [Outcome Ingestion Architecture RFC](rfc-outcome-ingestion-architecture.md)

## 6. Outbound Network Security

SEP discovery and external requests must respect the repository's outbound network security controls.

The shared implementation is located in:

`lib/stellar/outboundEgress.ts`

The policy is documented in:

[SEP Outbound Egress Policy](outbound-egress-policy.md)

The SEP clients use bounded request handling, endpoint validation, and controlled outbound access.

These protections help ensure that discovered external endpoints are not treated as unrestricted destinations.

Do not bypass the shared outbound-egress policy when extending SEP integrations.

## 7. How to Interpret SEP Evidence

The following distinctions are important when reading StellarCore's public information.

| Observed information | Correct interpretation | Incorrect interpretation |
| --- | --- | --- |
| SEP-1 metadata discovered | Anchor metadata was successfully discovered and parsed. | The anchor is currently operational. |
| SEP-6 advertised | A transfer-server interface is advertised. | StellarCore can execute a customer transfer. |
| SEP-10 advertised | A web-authentication endpoint is advertised. | StellarCore has unrestricted customer authorization. |
| SEP-24 advertised | An interactive transfer interface is advertised. | A deposit or withdrawal has been completed. |
| SEP-31 advertised | A direct-payment interface is advertised. | A cross-border payment has been verified. |
| SEP-38 advertised | A pricing interface is advertised. | A firm quote is available. |
| SEP-38 indicative price persisted | An indicative pricing observation was recorded. | The anchor guarantees that price. |

## 8. Relevant Source Files and Documentation

| Resource | Responsibility |
| --- | --- |
| `lib/stellar/sep1.ts` | SEP-1 parsing and discovery. |
| `lib/stellar/sep38.ts` | SEP-38 client operations and response validation. |
| `lib/stellar/sep10.ts` | SEP-10 authentication workflow. |
| `lib/stellar/outboundEgress.ts` | Shared outbound request policy. |
| `lib/rates/liveRateSource.ts` | Reviewed live indicative-rate source. |
| `lib/rates/median.ts` | Fresh independent observation eligibility and median calculation. |
| `constants/rates.ts` | Rate freshness and minimum-source configuration. |
| `docs/outbound-egress-policy.md` | Outbound network security boundaries. |
| `docs/api-reference.md` | Public API contracts. |
| `docs/privacy-custody-boundaries.md` | Privacy, custody, and read-only boundaries. |

## 9. Final Integration Boundary

StellarCore uses SEP functionality to discover anchor metadata, understand advertised capabilities, and obtain reviewed indicative pricing evidence.

These integrations do not turn StellarCore into a transfer execution platform, customer authorization service, firm-quote provider, or verified settlement system.

All future SEP integrations must preserve the repository's read-only evidence model and documented security boundaries.
