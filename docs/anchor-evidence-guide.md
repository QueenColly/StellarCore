
# Anchor Evidence Guide

This guide explains the anchor identity, advertised SEP metadata, corridor associations, and synchronization statuses displayed by StellarCore.

An anchor record represents information persisted by StellarCore after its synchronization and registry processes. It should be interpreted as stored evidence, not as a real-time guarantee about an anchor's external service.

## 1. Anchor identity

The public anchor representation includes the following identity fields:

| Field | Meaning |
| --- | --- |
| `name` | Anchor display name |
| `slug` | Stable identifier used by StellarCore routes |
| `homeDomain` | Anchor's configured home domain |
| `corridorCount` | Number of persisted corridor associations |
| `status` | Persisted synchronization status |
| `seps` | Persisted advertised SEP numbers |
| `isTransferCapable` | Derived metadata based on selected advertised SEP numbers |

### Name

`name` is the human-readable name displayed on the anchor card and detail page.

### Slug

`slug` is the stable identifier used by StellarCore to retrieve an anchor.

For example:

```text
cowrie
```

The public detail endpoint uses the slug:

```http
GET /api/anchors/cowrie
```

### Home domain

`homeDomain` identifies the anchor's configured home domain.

The domain is useful for understanding which anchor the record describes. Its presence in the API does not establish that the domain or any advertised service is currently reachable.

### Corridor count

`corridorCount` represents the number of persisted corridor associations for the anchor.

It does not indicate how many routes are currently available for transfers.

The anchor detail response also includes the associated corridor records, with source and destination asset and country information.

## 2. Advertised SEP metadata

StellarCore reads anchor metadata through SEP-1 synchronization and persists the SEP numbers observed during synchronization.

The public API exposes these values in the `seps` array.

The dashboard uses the known advertised SEP numbers to display descriptive capability labels. The currently recognized labels include:

| SEP | Dashboard description |
| --- | --- |
| SEP-6 | Transfer server advertised |
| SEP-10 | Web-auth endpoint advertised |
| SEP-24 | Interactive transfer server advertised |
| SEP-31 | Direct-payment server advertised |
| SEP-38 | Quote server advertised |

These labels describe metadata observed during synchronization. They do not prove that the corresponding endpoint is currently reachable, operational, or accepting customer requests.

An anchor may advertise a SEP while its endpoint is unavailable, misconfigured, restricted, or otherwise unable to complete a customer operation.

### Transfer-interface metadata

StellarCore derives `isTransferCapable` from the persisted SEP numbers:

- SEP-6
- SEP-24
- SEP-31

The property indicates that one of the selected transfer-related interfaces was advertised in the persisted metadata.

It does not mean StellarCore can execute a transfer, access a customer's transfer history, or verify a completed transaction.

SEP-38 advertisement also does not prove that an anchor is a currently reviewed rate source, that an indicative rate is fresh, or that a firm quote is available.

## 3. Synchronization statuses

The public anchor API exposes one of four persisted status values:

- `LIVE`
- `DEGRADED`
- `DOWN`
- `UNKNOWN`

The dashboard maps these values to visible labels:

| API status | Dashboard label | Interpretation |
| --- | --- | --- |
| `LIVE` | Synced | The persisted synchronization state is live |
| `DEGRADED` | Sync degraded | The persisted state records degraded synchronization evidence |
| `DOWN` | Sync failed | The persisted state records a down synchronization state |
| `UNKNOWN` | Sync unknown | There is not enough established synchronization evidence to assign another state |

These are synchronization labels, not live service-health guarantees.

### LIVE

`LIVE` is a persisted synchronization state produced by the anchor health logic after successful discovery evidence.

It does not guarantee that the anchor is currently accepting transactions or that every advertised endpoint is operational.

### DEGRADED

`DEGRADED` is an intermediate persisted state. It can represent synchronization failure evidence or an incomplete recovery from a previously degraded or down state.

It should not be interpreted as a precise percentage of uptime or a live service-quality measurement.

### DOWN

`DOWN` is a persisted state reached by the anchor health transition logic when the recorded failure evidence satisfies its configured transition policy.

It describes the synchronization state represented by stored evidence. It is not an independent probe of every anchor service.

### UNKNOWN

`UNKNOWN` represents an anchor for which the health state has not been established by sufficient observations.

It must not be interpreted as proof that the anchor is unhealthy. It means the available synchronization evidence does not establish another state.

### How the status is determined

The anchor health logic classifies discovery observations and applies deterministic state transitions.

The transition logic considers successful observations, failure classifications, and consecutive observations. Recovery from a degraded or down state requires additional successful evidence.

The exact thresholds and transition rules are implementation details. Review `lib/stellar/anchorHealth.ts` and the related constants before documenting or changing those rules.

Do not infer a status transition threshold from the dashboard label alone.

## 4. Anchor directory and detail API

The public anchor directory endpoint is:

```http
GET /api/anchors
```

It returns persisted anchors ordered by slug.

### Illustrative directory response

The following example is derived from the public serializer and existing API contract documentation. It is not a captured live production response.

```json
{
  "anchors": [
    {
      "slug": "cowrie",
      "name": "Cowrie",
      "homeDomain": "cowrie.exchange",
      "status": "LIVE",
      "seps": [1, 6],
      "isTransferCapable": true,
      "corridorCount": 1
    }
  ],
  "count": 1
}
```

The top-level `count` is the number of anchor records returned in the response.

An empty directory is a successful response:

```json
{
  "anchors": [],
  "count": 0
}
```

### Anchor detail

Retrieve one anchor by slug:

```http
GET /api/anchors/{slug}
```

The detail response includes the anchor's identity, status, advertised SEP numbers, derived transfer-interface metadata, and associated corridors.

An anchor without corridor associations can still be returned successfully. Its `corridors` array is empty.

See the [Public API Reference](api-reference.md) for complete response examples, validation rules, and error codes.

## 5. Reading anchor evidence safely

When interpreting an anchor record, keep the following distinctions in mind:

| Persisted field | What it supports | What it does not establish |
| --- | --- | --- |
| `homeDomain` | The domain recorded for the anchor | Current domain or endpoint reachability |
| `seps` | SEP numbers observed in synchronized metadata | Current endpoint availability |
| `isTransferCapable` | Presence of selected advertised transfer-related SEPs | An executable or completed transfer |
| `corridorCount` | Number of persisted corridor associations | A currently working route |
| `status` | Persisted synchronization state | Real-time uptime or transaction acceptance |

The anchor directory is read-only. It does not initiate transfers, authenticate customers, verify off-chain settlement, or guarantee that an anchor can currently provide a service.

Do not use the word "live" in documentation as shorthand for real-time availability when referring to the persisted `LIVE` status.

## 6. Implementation references

The behavior described in this guide is implemented by:

- `components/dashboard/AnchorsSection.tsx` — renders anchor cards and maps status values to dashboard labels.
- `app/anchors/[slug]/page.tsx` — renders the anchor detail page and synchronization explanation.
- `lib/api/anchors.ts` — validates anchor slugs and serializes public anchor responses.
- `lib/api/anchorRepository.ts` — reads persisted anchor records and corridor associations.
- `lib/stellar/anchorHealth.ts` — classifies synchronization observations and applies status transitions.
- `lib/stellar/advertisedCapabilities.ts` — maps recognized SEP numbers to cautious dashboard labels.
- `constants/seps.ts` — defines the SEP identifiers used by the implementation.
- `types/api/anchors.ts` — defines public anchor response fields and status values.
- `docs/api-reference.md` — documents the public anchor API contract.
- `docs/dashboard-guide.md` — explains the dashboard's anchor evidence.

Review these sources when changing anchor metadata, synchronization behavior, advertised capability labels, or public response fields.
