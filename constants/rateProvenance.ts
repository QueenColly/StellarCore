/**
 * Stable identifiers recording how a rate observation was captured (#113).
 *
 * These describe the reviewed pipeline shape, not runtime values, so they are
 * constant for every snapshot written by the reviewed live-rate boundary and
 * are stored verbatim as provenance evidence.
 */

/** The reviewed source type behind every persisted snapshot. */
export const RATE_CAPTURE_SOURCE_TYPE = "sep38_indicative_price";

/**
 * Version of the SEP-38 indicative-price request shape assembled by
 * `buildReviewedLiveRateCandidates`. Bump when the reviewed request fields
 * (assets, amount, delivery method, country, context) change meaning.
 */
export const SEP38_INDICATIVE_REQUEST_SHAPE_VERSION =
  "sep38-indicative-request-v1";
