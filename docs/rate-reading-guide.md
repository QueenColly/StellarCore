# How to Read Indicative-Rate Evidence

## Purpose

This guide explains how to interpret the stored SEP-38 indicative-rate observations exposed by StellarCore. It focuses on what the rate response means, how to read its source counts and freshness fields, and why a median can be unavailable.

For exact request parameters, response schemas, and error codes, use the [Public API Reference](api-reference.md#get-apiratescorridorslug). For the product's broader evidence boundaries, see [Product Scope](product-scope.md).

> **Important:** StellarCore exposes persisted indicative-rate evidence. An observation is not a firm quote, a guaranteed execution price, or proof that a transfer can be completed.

## 1. The three different source counts

A rates response contains several fields that describe different stages of the evidence pipeline. They must not be treated as interchangeable.

### Reviewed candidate configuration

`reviewedCandidateConfiguration` describes the reviewed static configuration for the requested corridor:

```json
{
  "candidateCount": 2,
  "uniqueAnchorCount": 2
}
```

This is a **synthetic example**.

- `candidateCount` is the number of reviewed source candidates configured for that corridor.
- `uniqueAnchorCount` is the number of distinct anchor slugs represented by those candidates.

This information is calculated from reviewed configuration. It does not make a network or database request and is not runtime evidence. A configured candidate may fail, be skipped, or have no persisted observation.

### Persisted source count

`sourceCount` describes the number of independent persisted source observations represented in the latest-rate result for the corridor.

It is evidence that observations were stored. It is not a count of configured candidates and does not establish that those sources are reachable now.

### Fresh source count

`freshSourceCount` is the number of persisted observations that pass the current freshness and rate-validity checks and are eligible for the median.

The implementation uses one latest observation per independent anchor source for the corridor. Old observations are not allowed to make a current median appear sufficiently supported.

The distinction is:

| Field | Answers this question |
| --- | --- |
| `candidateCount` | How many reviewed candidates are configured for this corridor? |
| `uniqueAnchorCount` | How many distinct anchors are represented in that configuration? |
| `sourceCount` | How many independent persisted observations are represented? |
| `freshSourceCount` | How many observations are currently eligible for the median? |

## 2. Why two independent fresh sources are required

The implementation constant in `constants/rates.ts` is:

```ts
export const MIN_FRESH_SOURCES = 2;
```

A median is produced only when at least two fresh independent observations have valid, non-zero rates. The median is calculated from the eligible observations after sorting their decimal values.

If fewer than two eligible observations remain:

- `state` is `insufficient_fresh_sources`.
- `medianRate` is `null`.
- `freshSourceCount` reports the number that did qualify.

This is a successful read of insufficient evidence, not necessarily an API error.

### Synthetic example: one fresh source

The following values are **synthetic** and do not represent live prices:

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

One fresh source cannot satisfy a two-source requirement. StellarCore deliberately returns no median rather than presenting a single-source value as an aggregate.

### Synthetic example: two eligible sources

The following is also **synthetic**. The values are only used to demonstrate the median rule:

```json
{
  "state": "healthy",
  "medianRate": "1.25",
  "sourceCount": 2,
  "freshSourceCount": 2,
  "medianRequirement": {
    "minimumFreshIndependentSources": 2
  },
  "observations": [
    {
      "anchor": { "slug": "example-anchor-a", "name": "Example Anchor A" },
      "rate": "1.20",
      "freshness": { "state": "fresh", "ageMs": 10000 },
      "eligibleForMedian": true
    },
    {
      "anchor": { "slug": "example-anchor-b", "name": "Example Anchor B" },
      "rate": "1.30",
      "freshness": { "state": "fresh", "ageMs": 12000 },
      "eligibleForMedian": true
    }
  ]
}
```

With two eligible values, the median is their arithmetic midpoint: `(1.20 + 1.30) / 2 = 1.25`. The example does not imply that either anchor is currently available or that a customer can obtain this price.

## 3. Freshness: when an observation can be used

StellarCore evaluates observation age against the configured freshness threshold in `constants/rates.ts`:

```ts
export const RATE_FRESHNESS_THRESHOLD_MS = 120_000;
```

That is 120 seconds. The threshold is inclusive: an observation whose age is exactly 120,000 milliseconds is still fresh.

The freshness implementation in `lib/rates/freshness.ts` classifies observations as follows:

| `freshness.state` | Meaning | Median treatment |
| --- | --- | --- |
| `fresh` | Timestamp is valid and age is at or below 120 seconds. | May qualify if its rate is also valid. |
| `stale` | Observation is older than 120 seconds. | Excluded. |
| `future` | Capture timestamp is later than the evaluation time. | Excluded. |
| `invalid` | Capture or evaluation timestamp cannot be parsed as a valid time. | Excluded. |

A fresh timestamp alone is not enough. A zero, malformed, or otherwise invalid rate is also excluded from the median.

### Fields to inspect

- `evaluatedAt`: the time at which the latest-rate result was evaluated.
- `observations[].capturedAt`: when an individual observation was captured.
- `observations[].freshness.state`: the observation's freshness classification.
- `observations[].freshness.ageMs`: the calculated age in milliseconds, or `null` when the timestamp is invalid.
- `observations[].eligibleForMedian`: whether the observation qualified for the median.
- `observations[].exclusionReason`: present when an observation is excluded.

Possible exclusion reasons documented by the API include `stale`, `future_timestamp`, `invalid_timestamp`, and `invalid_rate`.

## 4. Why the median can be null

A null `medianRate` is an intentional representation of insufficient evidence. Common reasons include:

1. There are no persisted observations for the corridor.
2. Only one independent source has a persisted observation.
3. Some observations are stale.
4. A timestamp is invalid or in the future.
5. A rate is invalid or zero, leaving fewer than two eligible observations.

Do not replace a null median with zero, reuse an old value as if it were current, or infer that the corridor is unavailable. Read `state`, source counts, timestamps, and exclusion reasons together.

The API may also serve a verified last-known-good response during a transient database failure. Such a response is marked with stale-evidence response headers; inspect those headers and timestamps rather than assuming the body is newly read from the database. See the [Public API Reference](api-reference.md#get-apiratescorridorslug).

## 5. Indicative observations are not firm quotes

SEP-38 distinguishes indicative price discovery from a firm quote lifecycle. StellarCore's reviewed rate process reads indicative prices and persists observations. It does not call the firm `/quote` lifecycle to reserve or create a customer quote.

Therefore:

- An observation records an indicative price at its capture time.
- A median summarizes eligible stored observations; it is not a price guaranteed by any anchor.
- A fresh observation is not a promise that the source will respond to a later request.
- A corridor relationship is not proof that a transfer can be executed.
- StellarCore does not execute a transfer or verify off-chain settlement.

For the current product boundary, read [Product Scope](product-scope.md).

## 6. Example: a complete synthetic interpretation

The following compact response is **synthetic**. It is not a captured production response and contains no live price claim:

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
  "sourceCount": 2,
  "freshSourceCount": 1,
  "reviewedCandidateConfiguration": {
    "candidateCount": 2,
    "uniqueAnchorCount": 2
  },
  "medianRequirement": {
    "minimumFreshIndependentSources": 2
  },
  "observations": [
    {
      "anchor": { "slug": "example-anchor-a", "name": "Example Anchor A" },
      "rate": "1.10",
      "capturedAt": "2030-01-01T11:59:00.000Z",
      "freshness": { "state": "fresh", "ageMs": 60000 },
      "eligibleForMedian": true
    },
    {
      "anchor": { "slug": "example-anchor-b", "name": "Example Anchor B" },
      "rate": "1.15",
      "capturedAt": "2030-01-01T11:55:00.000Z",
      "freshness": { "state": "stale", "ageMs": 300000 },
      "eligibleForMedian": false,
      "exclusionReason": "stale"
    }
  ]
}
```

Interpretation:

1. Two candidates are configured across two distinct anchors.
2. Two persisted source observations are represented.
3. Only one observation is fresh and eligible.
4. The minimum is two fresh independent sources.
5. The median is therefore `null`.

The example does not establish live availability, a firm quote, a verified transfer, or a current exchange rate.

## 7. Related documentation and implementation references

- [Product Scope](product-scope.md)
- [Public API Reference](api-reference.md#get-apiratescorridorslug)
- [Rate Snapshot Provenance](rate-provenance.md)
- [Dashboard User Guide](dashboard-guide.md#5-usdc--brl-rate-panel)
- Implementation: `constants/rates.ts`
- Implementation: `lib/rates/freshness.ts`
- Implementation: `lib/rates/median.ts`
- Implementation: `lib/rates/reviewedCandidateConfiguration.ts`
- Implementation: `lib/api/rates.ts`

## Sources checked and known limitations

This guide was checked against the `development` branch's API reference, rate-provenance documentation, dashboard guide, rate constants, freshness calculation, median calculation, reviewed-candidate configuration, and public rate serializer.

The examples are synthetic and are intended only to explain field relationships and calculation rules. They are not live observations. This guide does not establish current upstream source availability or promise that a configured candidate will produce a successful observation.
