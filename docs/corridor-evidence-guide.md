
# Corridor Evidence Guide

This guide explains how to interpret the corridors displayed by StellarCore and the information returned by the public corridor API.

A corridor represents a reviewed, persisted relationship between a source asset and country and a destination asset and country. It also records the anchors associated with that corridor.

A reviewed corridor is evidence of a configured relationship. It is not proof that a transfer route is currently operational.

## 1. What a corridor represents

A corridor describes the direction of an asset movement across two country contexts.

It contains:

- A source asset code.
- A source country code.
- A destination asset code.
- A destination country code.
- A unique corridor slug.
- Persisted associations with anchors.

For example, the illustrative corridor below represents NGNT from Nigeria to NGN in Nigeria:

| Field | Example | Meaning |
| --- | --- | --- |
| `slug` | `ngnt-ng-ngn-ng` | Stable identifier for the corridor |
| `sourceAsset` | `NGNT` | Asset code at the source |
| `sourceCountry` | `NG` | Source country code |
| `destinationAsset` | `NGN` | Asset code at the destination |
| `destinationCountry` | `NG` | Destination country code |
| `anchorCount` | `1` | Number of persisted anchor associations |

The source and destination values describe the reviewed corridor definition. They do not represent a live transaction request.

## 2. Understanding corridor fields

### Slug

`slug` is the unique identifier used to retrieve a corridor.

For example:

```text
ngnt-ng-ngn-ng
```

The public API uses the slug in the corridor detail route:

```text
GET /api/corridors/ngnt-ng-ngn-ng
```

The API validates corridor slugs before looking up the requested record.

### Source asset and country

The source fields identify the asset and country at the beginning of the reviewed corridor:

- `sourceAsset` is serialized from the corridor's `assetCodeFrom`.
- `sourceCountry` is serialized from the corridor's `countryFrom`.

### Destination asset and country

The destination fields identify the asset and country at the other end of the reviewed corridor:

- `destinationAsset` is serialized from the corridor's `assetCodeTo`.
- `destinationCountry` is serialized from the corridor's `countryTo`.

The source and destination should always be interpreted together. An asset code alone does not describe the complete corridor.

### Anchor count

`anchorCount` represents the number of persisted anchor associations for the corridor.

It is not a count of anchors that are currently online, accepting customer transactions, or capable of completing a transfer.

A corridor with zero associated anchors can still be returned successfully by the directory API. Its count is `0`, and its detail response contains an empty `anchors` array.

## 3. Reviewed anchor associations

StellarCore stores corridor definitions separately from the associations between anchors and corridors.

The relationship is represented through the anchor-corridor association used by the API repository.

A corridor detail response can include the anchors associated with that corridor. Each returned anchor includes:

| Field | Meaning |
| --- | --- |
| `slug` | Anchor identifier |
| `name` | Anchor display name |
| `homeDomain` | Anchor home domain |
| `status` | Persisted synchronization status |
| `seps` | Persisted advertised SEP numbers |
| `isTransferCapable` | Derived metadata indicating whether SEP-6, SEP-24, or SEP-31 is advertised |

These fields provide context about the persisted association. They do not establish that the anchor is currently reachable or accepting transfers.

In particular:

- An anchor association does not establish a working transfer route.
- A `LIVE` synchronization status is not a real-time availability guarantee.
- Advertised SEP metadata is not proof that the advertised endpoint is currently operational.
- `isTransferCapable` is not evidence of a completed or verified transfer.
- A corridor detail response does not create a firm quote or guarantee an exchange rate.

For more information about the anchor fields and synchronization states, see the [Anchor Evidence Guide](anchor-evidence-guide.md).

## 4. Corridor directory listing

The public directory endpoint is:

```http
GET /api/corridors
```

It returns persisted corridors ordered by slug.

### Illustrative response

The following example is derived from the public corridor serializer and existing API documentation. It is not a captured live production response.

```json
{
  "corridors": [
    {
      "slug": "ngnt-ng-ngn-ng",
      "sourceAsset": "NGNT",
      "sourceCountry": "NG",
      "destinationAsset": "NGN",
      "destinationCountry": "NG",
      "anchorCount": 1
    }
  ],
  "count": 1
}
```

The top-level `count` is the number of corridor records returned in the response. The `anchorCount` inside each corridor describes its associated anchors.

An empty directory is represented as a successful response:

```json
{
  "corridors": [],
  "count": 0
}
```

An empty result is not, by itself, an API error.

## 5. Corridor detail

Use the corridor slug to retrieve a corridor and its associated anchors:

```http
GET /api/corridors/{slug}
```

For example:

```http
GET /api/corridors/ngnt-ng-ngn-ng
```

### Illustrative response

The following example is derived from the corridor serializer and existing API contract documentation. It demonstrates the response structure, not live anchor availability.

```json
{
  "corridor": {
    "slug": "ngnt-ng-ngn-ng",
    "sourceAsset": "NGNT",
    "sourceCountry": "NG",
    "destinationAsset": "NGN",
    "destinationCountry": "NG",
    "anchorCount": 1,
    "anchors": [
      {
        "slug": "cowrie",
        "name": "Cowrie",
        "homeDomain": "cowrie.exchange",
        "status": "LIVE",
        "seps": [1, 6],
        "isTransferCapable": true
      }
    ]
  }
}
```

The `anchors` array contains the persisted anchor associations returned by the detail repository. The API orders those associations by anchor slug.

A corridor with no associated anchors is represented with:

```json
{
  "anchorCount": 0,
  "anchors": []
}
```

The actual response also includes the corridor's slug and source/destination fields.

## 6. Errors and missing records

The corridor detail API distinguishes invalid slugs, missing records, and internal errors.

| HTTP status | Error code | Meaning |
| --- | --- | --- |
| `400` | `invalid_corridor_slug` | The supplied slug does not satisfy the API validation rules |
| `404` | `corridor_not_found` | The slug is valid, but no matching corridor exists |
| `500` | `internal_error` | The corridor repository could not complete the read |

An error response uses the public API error envelope:

```json
{
  "error": {
    "code": "corridor_not_found",
    "message": "Corridor not found."
  }
}
```

See the [Public API Reference](api-reference.md) for the complete response contract and error behavior.

## 7. What reviewed membership does not prove

A corridor association must not be interpreted as evidence of a successful transfer path.

StellarCore's corridor directory is read-only. It does not:

- Initiate or execute a transfer.
- Confirm that an anchor is currently accepting transactions.
- Verify customer eligibility or account availability.
- Confirm that a deposit or withdrawal can be completed.
- Guarantee that an exchange rate is available.
- Create or return a firm quote.
- Verify off-chain settlement.

A persisted association is useful for understanding the reviewed directory and its anchor relationships. Any stronger operational claim requires separate, current evidence that the corridor directory does not provide.

## 8. Implementation references

The corridor behavior described in this guide is implemented by:

- `components/dashboard/CorridorsSection.tsx` — renders the dashboard corridor directory.
- `lib/api/corridors.ts` — validates slugs and serializes corridor list and detail results.
- `lib/api/corridorRepository.ts` — reads persisted corridor records and anchor associations.
- `types/api/corridors.ts` — defines the public corridor response types.
- `app/api/corridors/route.ts` — handles the corridor directory request.
- `app/api/corridors/[slug]/route.ts` — handles corridor detail requests.
- `docs/api-reference.md` — documents the public API contract.
- `docs/dashboard-guide.md` — explains how to interpret the dashboard evidence.

Review these files when changing corridor fields, association behavior, response serialization, or dashboard presentation.
