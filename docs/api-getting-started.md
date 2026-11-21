# Public API Getting Started

## Purpose

This tutorial shows how to make basic read-only requests to the StellarCore public API and how to interpret the returned evidence.

The examples use `GET` requests only. They do not require a secret token, do not change application data, and do not initiate transfers.

For complete request parameters, response contracts, validation rules, and error codes, see the [Public API Reference](api-reference.md). For the boundaries of the product, see [Product Scope](product-scope.md).

> **Example data notice:** Every JSON response in this tutorial is synthetic and illustrative. It is not a captured live response, a live availability report, a firm quote, or evidence of a completed transfer.

## 1. Before you begin

You need an HTTP client such as `curl`, a browser, or a programming language's HTTP library.

Set the API base URL to the host you are using:

```bash
# Local development
export STELLARCORE_API_BASE="http://localhost:3000"

# For a deployed environment, replace the value with its actual base URL.
# Do not assume that a sample domain is a production endpoint.
```

The public API is read-only and exposes `GET` routes. The documented public responses use JSON and `Cache-Control: no-store`. Public endpoints are rate limited; see the [API reference](api-reference.md#rate-limiting) for the documented limit and behavior.

## 2. List persisted anchors

Request the anchor directory:

```bash
curl --fail-with-body \
  --silent \
  --show-error \
  --include \
  "$STELLARCORE_API_BASE/api/anchors"
```

A **synthetic** response body could look like this:

```json
{
  "anchors": [
    {
      "slug": "example-anchor",
      "name": "Example Anchor",
      "homeDomain": "anchor.example",
      "status": "UNKNOWN",
      "seps": [1, 6],
      "isTransferCapable": true,
      "corridorCount": 1
    }
  ],
  "count": 1
}
```

How to read it:

- `slug` is the identifier used in the anchor detail route.
- `status` is the last persisted synchronization status. It is not a live health check.
- `seps` contains advertised SEP numbers discovered during synchronization.
- `isTransferCapable` is derived from advertised SEP-6, SEP-24, or SEP-31 support. It does not mean StellarCore can execute a transfer.
- `corridorCount` is the number of persisted corridor associations.

An empty directory is a valid response:

```json
{
  "anchors": [],
  "count": 0
}
```

To inspect one anchor, use its slug:

```bash
curl --fail-with-body \
  --silent \
  --show-error \
  "$STELLARCORE_API_BASE/api/anchors/example-anchor"
```

The detail route returns the anchor and its persisted associated corridors. A valid but unknown slug returns `404`; a malformed slug returns `400`.

See [GET /api/anchors](api-reference.md#get-api-anchors) and [GET /api/anchors/{slug}](api-reference.md#get-api-anchorsslug).

## 3. List persisted corridors

Request the corridor directory:

```bash
curl --fail-with-body \
  --silent \
  --show-error \
  "$STELLARCORE_API_BASE/api/corridors"
```

A **synthetic** response body:

```json
{
  "corridors": [
    {
      "slug": "example-corridor",
      "sourceAsset": "USDC",
      "sourceCountry": "US",
      "destinationAsset": "EUR",
      "destinationCountry": "DE",
      "anchorCount": 1
    }
  ],
  "count": 1
}
```

A corridor is a reviewed, persisted relationship. `anchorCount` describes the number of associated anchor records; it does not show that a transfer route is currently operational or executable.

To retrieve one corridor and its associated anchors:

```bash
curl --fail-with-body \
  --silent \
  --show-error \
  "$STELLARCORE_API_BASE/api/corridors/example-corridor"
```

See [GET /api/corridors](api-reference.md#get-apicorridors) and [GET /api/corridors/{slug}](api-reference.md#get-apicorridorsslug).

## 4. Read indicative-rate evidence

The rates endpoint requires a corridor slug:

```bash
curl --fail-with-body \
  --silent \
  --show-error \
  "$STELLARCORE_API_BASE/api/rates?corridor=example-corridor"
```

A **synthetic** response body:

```json
{
  "corridor": {
    "slug": "example-corridor",
    "sourceAsset": "USDC",
    "sourceCountry": "US",
    "destinationAsset": "EUR",
    "destinationCountry": "DE"
  },
  "evaluatedAt": "2030-01-01T12:00:00.000Z",
  "state": "insufficient_fresh_sources",
  "medianRate": null,
  "sourceCount": 1,
  "freshSourceCount": 1,
  "reviewedCandidateConfiguration": {
    "candidateCount": 1,
    "uniqueAnchorCount": 1
  },
  "medianRequirement": {
    "minimumFreshIndependentSources": 2
  },
  "observations": [
    {
      "anchor": {
        "slug": "example-anchor",
        "name": "Example Anchor"
      },
      "rate": "1.10",
      "sourceAmount": "100",
      "destinationAmount": "110",
      "fee": "0",
      "capturedAt": "2030-01-01T11:59:00.000Z",
      "freshness": {
        "state": "fresh",
        "ageMs": 60000
      },
      "eligibleForMedian": true
    }
  ]
}
```

Important fields:

- `evaluatedAt` is when the result was evaluated.
- `sourceCount` is the number of independent persisted observations represented.
- `freshSourceCount` is the number currently eligible for the median.
- `reviewedCandidateConfiguration` describes reviewed configuration, not successful live source availability.
- `medianRequirement.minimumFreshIndependentSources` is `2`.
- `medianRate` is `null` when fewer than two fresh independent sources qualify.
- `observations[].rate` and amount fields are decimal strings to preserve precision.
- `observations[].capturedAt` and `observations[].freshness` help you assess the age of each observation.
- `eligibleForMedian` and an optional `exclusionReason` explain whether an observation contributes to the median.

The median is an aggregation of eligible indicative observations. It is not a firm quote or a guaranteed price. Read the [Rate Reading Guide](rate-reading-guide.md) before using this information in a product or decision.

You can also request stored history:

```bash
curl --fail-with-body \
  --silent \
  --show-error \
  "$STELLARCORE_API_BASE/api/rates/history?corridor=example-corridor&days=30"
```

The `days` parameter accepts an integer from 1 through 365 and defaults to 30 when omitted. Historical points can also have a null median when evidence is insufficient.

See [GET /api/rates](api-reference.md#get-apiratescorridorslug) and [GET /api/rates/history](api-reference.md#get-apirateshistory).

## 5. Read reputation evaluations

Request the reputation directory:

```bash
curl --fail-with-body \
  --silent \
  --show-error \
  "$STELLARCORE_API_BASE/api/reputation"
```

A **synthetic** response body:

```json
{
  "reputation": [
    {
      "anchor": {
        "slug": "example-anchor",
        "name": "Example Anchor"
      },
      "state": "insufficient_evidence",
      "score": null,
      "scoreBand": null,
      "evidence": {
        "outcomeCount": 4
      },
      "metrics": {
        "fillRate7d": null,
        "fillRate30d": null,
        "fillRate90d": null,
        "settleP50Ms": null,
        "settleP95Ms": null,
        "slippageP50": null,
        "slippageP95": null
      },
      "computedAt": "2030-01-01T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

The public API can report these states:

| `state` | Meaning |
| --- | --- |
| `not_evaluated` | No persisted reputation evaluation is available for the anchor. |
| `insufficient_evidence` | An evaluation exists, but its evidence does not meet the score requirements. |
| `established` | The persisted evaluation satisfies the implementation's requirements for publishing a score. |

A `null` score is not zero. It means no numerical score is available in that response. Individual metrics may also be `null` when the relevant persisted evidence is unavailable.

The implementation requires at least 30 outcomes in the 90-day outcome window, at least one synchronized corridor, and at least one latest rate observation before it publishes a score. The project does not currently have a trusted production transfer-outcome ingestion source, so do not assume every anchor will have an established score.

To inspect one anchor:

```bash
curl --fail-with-body \
  --silent \
  --show-error \
  "$STELLARCORE_API_BASE/api/reputation/example-anchor"
```

See [GET /api/reputation](api-reference.md#get-apireputation) and [Reputation Methodology](reputation-methodology.md).

## 6. Understand errors and nullable fields

A successful HTTP response does not mean every evidence field contains a value. For example, a `200` rates response can legitimately contain `medianRate: null`, and a `200` reputation response can contain `score: null`.

The public API uses a bounded error object for request failures. A **synthetic** example:

```json
{
  "error": {
    "code": "corridor_not_found",
    "message": "Corridor not found."
  }
}
```

Common cases include:

- `400`: invalid or missing request parameters, such as a malformed slug or missing corridor.
- `404`: a syntactically valid anchor or corridor slug that is not present.
- `429`: the public request rate limit has been exceeded.
- `500`: the requested read could not be completed.

Consult the [Public API Reference](api-reference.md) for the exact error codes and route-specific behavior.

## 7. Respect no-store responses

StellarCore's public API responses are sent with:

```http
Cache-Control: no-store
```

The routes are configured for dynamic responses. Clients and intermediary layers should respect the response's no-store directive rather than retaining these responses as reusable cached evidence.

For browser `fetch`, you can explicitly request no-store behavior as well:

```ts
const response = await fetch(
  `${apiBaseUrl}/api/anchors`,
  { method: "GET", cache: "no-store" },
);

if (!response.ok) {
  throw new Error(`StellarCore API request failed: ${response.status}`);
}

const data: unknown = await response.json();
```

This is a minimal transport example, not a complete runtime schema validator. Validate the response shape before relying on fields in application code.

## 8. Public API safety checklist

- Use only the documented public `GET` routes.
- Do not send secret tokens, wallet keys, or customer credentials.
- Do not call the internal scheduled refresh route as a public integration endpoint.
- Respect `Cache-Control: no-store` and public rate limits.
- Treat anchor status and SEP declarations as persisted metadata, not live availability.
- Treat corridor associations as reviewed relationships, not executable routes.
- Treat rate observations as indicative evidence, not firm quotes.
- Treat null medians and null reputation scores as unavailable evidence, not zero values.
- Never infer verified off-chain settlement from the public API.

## Related documentation

- [Documentation Index](README.md)
- [Product Scope](product-scope.md)
- [Rate Reading Guide](rate-reading-guide.md)
- [Public API Reference](api-reference.md)
- [Privacy and Custody Boundaries](privacy-custody-boundaries.md)
- [Reputation Methodology](reputation-methodology.md)

## Sources checked and known limitations

This tutorial was checked against the `development` branch's public API reference, API route handlers, API serializers, rate freshness and median implementation, reputation serializer and methodology, and privacy/custody documentation.

The response bodies above are synthetic teaching examples. They are not captured from a live deployment, and the tutorial does not claim current anchor availability, live prices, firm quotes, verified transfers, or universal reputation coverage. The tutorial intentionally uses placeholders for the API base URL and slugs.
