
# Reputation Evidence Reading Guide

This guide explains how to interpret the reputation information displayed by StellarCore, including evaluation states, insufficient evidence, conditional scores, outcome counts, and unavailable metrics.

It is a user-facing interpretation guide. For the authoritative scoring implementation, thresholds, weights, and mathematical calculations, see the [Reputation Methodology](reputation-methodology.md).

## 1. Understanding Reputation Evidence

StellarCore calculates reputation from evidence already persisted in its database.

A reputation evaluation is an interpretation of available evidence. It is not an independent endorsement of an anchor, a guarantee of financial trustworthiness, or proof that a transfer has successfully settled.

The public reputation API exposes three possible evaluation states:

| State | Meaning |
| --- | --- |
| `not_evaluated` | No persisted reputation evaluation exists for the anchor. |
| `insufficient_evidence` | An evaluation exists, but the available evidence does not satisfy the requirements for publishing a score. |
| `established` | The available evidence satisfies the requirements for publishing a score. |

These states communicate different evidence conditions and should not be treated as interchangeable.

## 2. Not Evaluated

The `not_evaluated` state means StellarCore does not have a persisted reputation evaluation for the anchor.

This can occur when:

- The anchor has not yet been evaluated.
- No reputation score record has been persisted.
- The scheduled evaluation has not produced a persisted result for the anchor.

The public API represents this state with:

- `state`: `not_evaluated`
- `score`: `null`
- `scoreBand`: `null`
- `evidence`: `null`
- `metrics`: `null`
- `computedAt`: `null`

**How to interpret it:**

There is no persisted evaluation available to interpret.

This does not establish that the anchor has poor performance, has failed transfers, or is operationally unavailable.

## 3. Insufficient Evidence

The `insufficient_evidence` state means a persisted evaluation exists, but the evidence does not satisfy all requirements for publishing a reputation score.

The implementation requires all of the following:

1. At least 30 recorded transfer outcomes within the 90-day evaluation window.
2. At least one associated corridor.
3. At least one latest rate observation for an associated corridor.

Meeting only one or two of these requirements is not sufficient.

When the requirements are not satisfied:

- The public state is `insufficient_evidence`.
- The score remains `null`.
- The score band remains `null`.
- The persisted outcome count remains available through the evidence object.
- Available metrics may still be displayed when their underlying evidence exists.

**Important:** Insufficient evidence is not a zero score.

A missing score must not be interpreted as a poor reputation result.

## 4. Established Reputation and Conditional Scores

The `established` state means the evaluation satisfies the requirements for publishing a numerical reputation score.

An established score is conditional on the evidence available to StellarCore at the time of evaluation.

The score represents the implemented evaluation of four evidence components:

| Component | Weight |
| --- | ---: |
| Availability | 20% |
| Rate freshness | 15% |
| Coverage | 15% |
| Transfer reliability | 50% |

The score is calculated using the methodology documented in the [Reputation Methodology](reputation-methodology.md).

The resulting score is an integer between 0 and 100.

### Understanding score bands

| Score | Band |
| --- | --- |
| 95–100 | GREEN |
| 80–94 | AMBER |
| 0–79 | RED |

The public API serializes these band names in lowercase.

A score band is only available when a valid score has been established.

### Why a score is conditional

A score should be interpreted alongside its evidence and evaluation timestamp.

It is not a permanent certification of an anchor.

A later evaluation can produce a different result when the underlying persisted evidence changes.

## 5. Understanding Outcome Counts

The public reputation response includes an evidence object containing:

`outcomeCount`

This represents the number of transfer outcomes included in the persisted evaluation.

The evaluation uses a rolling 90-day outcome window.

The outcome count helps users understand the quantity of evidence behind the evaluation.

For example, an outcome count below the minimum threshold indicates that the evaluation does not yet have enough recorded outcomes to publish a score.

The count does not independently prove that the outcomes represent verified customer transfers or independently confirmed settlements.

StellarCore's transfer-outcome model and scoring implementation must not be confused with a trusted production outcome-ingestion source.

See the [Privacy and Custody Boundaries](privacy-custody-boundaries.md) documentation for the distinction between persisted evidence and customer-context operations.

## 6. Understanding Missing Metrics

A reputation card may contain metrics that are unavailable even when an evaluation exists.

The public response exposes the following metrics:

| Metric | Meaning |
| --- | --- |
| `fillRate7d` | Completed-outcome ratio over seven days. |
| `fillRate30d` | Completed-outcome ratio over thirty days. |
| `fillRate90d` | Completed-outcome ratio over ninety days. |
| `settleP50Ms` | 50th-percentile settlement duration. |
| `settleP95Ms` | 95th-percentile settlement duration. |
| `slippageP50` | 50th-percentile slippage. |
| `slippageP95` | 95th-percentile slippage. |

Metric availability depends on the evidence available in the corresponding evaluation window.

### Fill-rate metrics

A fill-rate metric is `null` when its evaluation window contains no outcomes.

When outcomes exist, the metric represents the ratio of completed outcomes to total outcomes in that window.

### Settlement and slippage metrics

Settlement and slippage percentiles use completed outcomes within the 30-day metrics window.

They are unavailable when there are no completed outcomes in that window.

### Important distinction

A missing metric is not automatically a zero metric.

For example:

- A `null` fill rate means there is no usable outcome denominator for that window.
- A numerical zero means the calculation produced zero based on available evidence.
- A `null` settlement percentile means there are no qualifying completed outcomes for the calculation.

Do not replace unavailable values with invented numbers.

## 7. Persisted Evidence Versus Live Verification

StellarCore provides read-only access to persisted evidence.

A reputation card must not be interpreted as proof of:

- Current anchor availability.
- A currently executable transfer route.
- A firm exchange-rate quote.
- A verified on-chain and off-chain transfer.
- Independently confirmed settlement.
- Customer authorization or access to private transfer history.

Advertised Stellar SEP capabilities and persisted rate observations are different evidence categories.

A numerical reputation evaluation does not change these boundaries.

## 8. Understanding Evaluation Time

The public reputation response includes `computedAt` when a persisted evaluation exists.

This timestamp identifies when the reputation evaluation was computed.

It should not be interpreted as:

- The time a transfer occurred.
- The time a customer authorized a transaction.
- The time an anchor was last contacted.
- Proof of current anchor availability.

When `computedAt` is unavailable, users should not infer an evaluation time.

For more information, see the [Freshness Reading Guide](freshness-reading-guide.md).

## 9. Where to Find More Information

| Resource | Purpose |
| --- | --- |
| [Reputation Methodology](reputation-methodology.md) | Mathematical scoring rules, thresholds, weights, and score bands. |
| [Public API Reference](api-reference.md) | Reputation response fields and API behavior. |
| [Dashboard User Guide](dashboard-guide.md) | General dashboard navigation and reputation presentation. |
| [Privacy and Custody Boundaries](privacy-custody-boundaries.md) | Read-only evidence and customer-context restrictions. |
| [Freshness Reading Guide](freshness-reading-guide.md) | Interpretation of evidence timestamps and freshness. |

Public reputation endpoints:

```text
GET /api/reputation
GET /api/reputation/{slug}
```

## 10. Final Interpretation

The most important distinction is between the absence of an evaluation, insufficient evidence, and an established evaluation.

- `not_evaluated` means no persisted evaluation exists.
- `insufficient_evidence` means an evaluation exists but cannot support a published score.
- `established` means the evidence requirements for publishing a score have been met.

Always interpret the score, evidence count, metrics, and evaluation timestamp together.

A reputation score is an evidence-based evaluation, not a guarantee of future performance or financial trustworthiness.
