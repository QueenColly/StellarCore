
# Evidence Timestamp and Freshness Reading Guide

This guide explains the timestamps and freshness concepts used throughout StellarCore.

Different timestamps describe different events. They must not be treated as interchangeable indicators of when an anchor was last available, when a price was observed, or when a reputation evaluation was calculated.

StellarCore presents persisted evidence and read-only information. A timestamp does not automatically establish live availability.

## 1. Understanding Evidence Timestamps

StellarCore uses several timestamps across its evidence model and public API.

| Timestamp | Meaning |
| --- | --- |
| `capturedAt` | When an individual rate observation was captured. |
| `evaluatedAt` | The evaluation time used when reading and assessing rate evidence. |
| `computedAt` | When a persisted reputation evaluation was computed. |
| `generatedAt` | When a last-known-good evidence snapshot was generated. |
| `expiresAt` | When a retained stale snapshot becomes ineligible for fallback use. |
| Unknown observation time | The source observation time is unavailable or cannot be validated. |

These timestamps describe different stages of evidence processing.

They do not all describe the same event.

## 2. Observed-At: capturedAt

The `capturedAt` field identifies when a rate observation was captured and persisted by StellarCore.

It is associated with an individual rate observation.

The public rate API exposes this timestamp for each observation.

The RatePanel displays the observation timestamp using the `EvidenceTimestamp` component.

### How to interpret it

`capturedAt` answers:

"When was this rate observation captured?"

It does not answer:

- Is the anchor available right now?
- Is the same price still being offered?
- Can a customer execute a transaction at this price?
- Has a transfer been completed?

A captured observation is persisted pricing evidence, not a guaranteed current price.

## 3. Evaluated-At: evaluatedAt

The `evaluatedAt` field identifies the time at which StellarCore evaluated the latest rate evidence for a corridor.

The public rates response includes this timestamp.

The RatePanel displays it separately from the observation capture timestamp.

### How to interpret it

`evaluatedAt` answers:

"When was this rate evidence evaluated?"

It is not the time the underlying anchor necessarily generated its price.

An evaluation can inspect observations captured earlier.

Consequently, `evaluatedAt` and `capturedAt` may differ.

A recent evaluation timestamp does not automatically make an older observation fresh.

## 4. Computed-At: computedAt

The `computedAt` field identifies when a persisted reputation evaluation was computed.

It is exposed in the public reputation response when a persisted evaluation exists.

### How to interpret it

`computedAt` answers:

"When was this reputation evaluation computed?"

It does not indicate:

- When a transfer occurred.
- When an anchor was last contacted.
- When a customer authorized a transaction.
- When a payment settled.
- Whether an anchor is currently available.

When no persisted reputation evaluation exists, `computedAt` is null.

The dashboard must not invent an evaluation timestamp for an anchor without a persisted evaluation.

## 5. Generated-At: generatedAt

The `generatedAt` field belongs to the last-known-good evidence fallback mechanism.

It identifies when StellarCore generated a retained evidence snapshot.

This timestamp is separate from the timestamps contained inside the snapshot's original evidence.

For example, a snapshot may be generated after a successful API read while containing rate observations captured earlier.

### How to interpret it

`generatedAt` answers:

"When was this retained snapshot generated?"

It does not mean that the underlying anchor or rate source was contacted at that exact time.

The API can expose this information through stale response metadata and headers.

Relevant implementation:

- `lib/api/staleEvidence.ts`
- `types/api/staleEvidence.ts`

## 6. Expires-At: expiresAt

The `expiresAt` field identifies when a retained stale evidence snapshot expires.

The current implementation limits stale snapshots to a maximum age of five minutes.

The relevant constant is:

```text
STALE_EVIDENCE_MAX_AGE_MS = 5 * 60_000
```

A snapshot is not eligible for fallback after its expiration time.

An expired snapshot must not be presented as an acceptable last-known-good response.

## 7. Understanding Freshness States

The rate observation freshness model distinguishes four states:

| State | Meaning |
| --- | --- |
| `fresh` | The observation is within the configured freshness threshold. |
| `stale` | The observation is older than the permitted freshness threshold. |
| `future` | The observation timestamp is ahead of the evaluation time. |
| `invalid` | The timestamp is invalid or cannot be interpreted reliably. |

The shared rate freshness threshold defaults to:

```text
RATE_FRESHNESS_THRESHOLD_MS = 120000
```

This represents 120 seconds.

Freshness is calculated relative to the relevant evaluation time.

### Fresh observations

An observation is fresh when its age is less than or equal to the configured threshold.

A fresh observation may qualify for median calculation if it also satisfies the other eligibility requirements.

### Stale observations

An observation is stale when it is older than the permitted freshness threshold.

A stale observation is not eligible for the fresh-source median calculation.

It may still remain part of the persisted evidence returned by the API.

### Future timestamps

An observation with a timestamp ahead of the evaluation time is classified as future.

It must not be treated as a valid fresh observation.

### Invalid timestamps

An invalid timestamp cannot establish a reliable observation time.

The API may represent its age as null and provide an exclusion reason.

An invalid timestamp must not be silently converted into a current timestamp.

## 8. Unknown Observation Time

Some evidence areas do not expose an individual observation timestamp.

For example:

- The anchor directory exposes persisted metadata and synchronization status.
- The corridor directory exposes persisted corridor relationships.
- Reputation evaluations expose `computedAt`, rather than individual transfer-observation timestamps.

A missing timestamp must not be replaced with an assumed current time.

If the source observation time is unknown, users should interpret it as unknown.

The absence of a timestamp is not proof that the underlying information is current.

## 9. Last-Known-Good Evidence and Stale Responses

StellarCore supports a bounded last-known-good evidence fallback for eligible rate and reputation API requests.

The fallback mechanism is implemented in:

`lib/api/staleEvidence.ts`

When an eligible transient database failure prevents a fresh read, a previously persisted snapshot may be returned if it passes the required validation.

The stale response includes metadata such as:

- `state`
- `generatedAt`
- `expiresAt`
- `sourceTimes`
- `snapshotAgeMs`

The HTTP response can also include:

```text
X-Evidence-State: stale
X-Evidence-Generated-At
X-Evidence-Expires-At
X-Evidence-Source-Time
Warning: 110 - "Response is stale"
```

### Important distinction

A stale response means StellarCore is serving previously retained evidence.

It does not mean the data has been freshly retrieved from the primary database.

The snapshot's generation timestamp must not be confused with the original evidence timestamps.

The stale fallback is bounded by the five-minute maximum age and the snapshot validation rules.

The anchor and corridor directory endpoints must not be assumed to support this fallback.

## 10. How the Dashboard Displays Timestamps

The timestamp formatter is implemented in:

`components/ui/EvidenceTimestamp.tsx`

The component:

- Accepts a timestamp string.
- Validates that the date can be parsed.
- Formats valid timestamps in an explicit UTC representation.
- Displays `Unavailable` when a timestamp is missing or invalid.

The RatePanel uses this component for:

- Rate evaluation time.
- Individual rate observation capture times.

The reputation section displays its computed timestamp separately.

Not every dashboard section displays a timestamp.

The existence of a timestamp in one section must not be used to infer a timestamp for another section.

## 11. Practical Interpretation Examples

The following examples describe timestamp relationships and are illustrative, not captured production evidence.

### Example A: Observation captured before evaluation

```text
capturedAt:  12:00:00 UTC
evaluatedAt: 12:00:30 UTC
```

Interpretation:

The observation was captured before the rate evaluation.

The difference between the timestamps is not itself an error.

Its freshness must still be determined using the configured threshold.

### Example B: Stale observation

```text
capturedAt:  11:55:00 UTC
evaluatedAt: 12:00:00 UTC
```

Interpretation:

The observation is five minutes old at evaluation time.

It exceeds the default 120-second rate freshness threshold and is therefore stale.

It must not be counted as a fresh independent source for the median.

### Example C: Stale fallback snapshot

```text
generatedAt: 12:00:00 UTC
expiresAt:   12:05:00 UTC
```

Interpretation:

The retained snapshot was generated at 12:00 UTC and is eligible only within its validated lifetime.

Its existence does not prove that an anchor was contacted at 12:00 UTC.

### Example D: Reputation computation

```text
computedAt: 12:00:00 UTC
```

Interpretation:

The persisted reputation evaluation was computed at 12:00 UTC.

It does not prove that a transfer occurred at that time or that an anchor is currently operational.

## 12. No Global Live Badge

StellarCore must not treat the presence of a recent timestamp as a universal live indicator.

Different evidence types have different meanings and freshness rules.

For example:

- A recently evaluated rate can contain older observations.
- A recently generated fallback snapshot can contain previously persisted evidence.
- A reputation evaluation timestamp does not establish current anchor availability.
- A persisted anchor status does not independently establish current network reachability.

Freshness must be interpreted within the context of the specific evidence type.

## 13. Relevant Implementation and Documentation

| Resource | Responsibility |
| --- | --- |
| `components/ui/EvidenceTimestamp.tsx` | Timestamp validation and UTC presentation. |
| `components/dashboard/RatePanel.tsx` | Rate evaluation and observation timestamp presentation. |
| `lib/rates/median.ts` | Rate freshness and median eligibility. |
| `constants/rates.ts` | Rate freshness threshold. |
| `lib/api/staleEvidence.ts` | Last-known-good snapshot generation, validation, and expiration. |
| `types/api/staleEvidence.ts` | Stale evidence metadata contract. |
| `types/api/rates.ts` | Public rate observation and evaluation timestamp contract. |
| `types/api/reputation.ts` | Public reputation timestamp contract. |
| [Rate Reading Guide](rate-reading-guide.md) | Interpretation of rate observations and median eligibility. |
| [Reputation Methodology](reputation-methodology.md) | Reputation evaluation and metrics windows. |
| [Public API Reference](api-reference.md) | Public timestamp and response fields. |

## 14. Final Interpretation

Always distinguish the time an observation was captured, the time evidence was evaluated, the time reputation was computed, and the time a retained snapshot was generated.

These timestamps represent different events.

A timestamp does not independently prove current availability, a firm quote, a verified transfer, or successful settlement.

When an observation time cannot be established, it must remain unknown rather than being presented as current.
