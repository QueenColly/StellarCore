import {
  absDecimalDiff,
  compareDecimals,
  formatDecimal,
  isZeroDecimal,
  parseDatabaseDecimal,
  type ExactDecimal,
} from "@/lib/rates/decimal";
import type {
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";

export const MIN_DISTINCT_RATES = 2;

export type ObservedRate = Readonly<{
  decimal: ExactDecimal;
  original: string;
}>;

export type PointRateSummary = Readonly<{
  isQualified: boolean;
  excludedRateCount: number;
  minRate: ObservedRate | null;
  maxRate: ObservedRate | null;
}>;

export type ObservedRateRangeSummary = Readonly<{
  pointCount: number;
  qualifiedPointCount: number;
  excludedPointCount: number;
  excludedRateCount: number;
  minRate: string | null;
  maxRate: string | null;
  range: string | null;
}>;

export function parseObservedRate(value: string): ObservedRate | null {
  if (typeof value !== "string") return null;
  try {
    const decimal = parseDatabaseDecimal(value);
    if (isZeroDecimal(decimal)) return null;
    return Object.freeze({ decimal, original: value });
  } catch {
    return null;
  }
}

export function summarizePointRates(
  point: PublicRateHistoryPoint | null | undefined,
): PointRateSummary {
  const seen = new Set<string>();
  let excludedRateCount = 0;
  const rates: ObservedRate[] = [];

  for (const observation of point?.observations ?? []) {
    const slug =
      typeof observation?.anchor?.slug === "string"
        ? observation.anchor.slug
        : "";
    if (seen.has(slug)) continue;
    seen.add(slug);

    const rate = parseObservedRate(observation?.rate);
    if (rate) rates.push(rate);
    else excludedRateCount += 1;
  }

  if (rates.length < MIN_DISTINCT_RATES) {
    return Object.freeze({
      isQualified: false,
      excludedRateCount,
      minRate: null,
      maxRate: null,
    });
  }

  let minRate = rates[0]!;
  let maxRate = rates[0]!;
  for (const rate of rates) {
    if (compareDecimals(rate.decimal, minRate.decimal) < 0) minRate = rate;
    if (compareDecimals(rate.decimal, maxRate.decimal) > 0) maxRate = rate;
  }

  return Object.freeze({
    isQualified: true,
    excludedRateCount,
    minRate,
    maxRate,
  });
}

export function summarizeObservedRateRange(
  response: PublicRateHistoryResponse | null | undefined,
): ObservedRateRangeSummary {
  const points = response?.points ?? [];
  let excludedRateCount = 0;
  let qualifiedPointCount = 0;
  let overallMin: ObservedRate | null = null;
  let overallMax: ObservedRate | null = null;

  for (const point of points) {
    const pointSummary = summarizePointRates(point);
    excludedRateCount += pointSummary.excludedRateCount;
    if (!pointSummary.isQualified) continue;
    qualifiedPointCount += 1;

    if (overallMin === null || compareDecimals(pointSummary.minRate!.decimal, overallMin.decimal) < 0) {
      overallMin = pointSummary.minRate!;
    }
    if (overallMax === null || compareDecimals(pointSummary.maxRate!.decimal, overallMax.decimal) > 0) {
      overallMax = pointSummary.maxRate!;
    }
  }

  return Object.freeze({
    pointCount: points.length,
    qualifiedPointCount,
    excludedPointCount: points.length - qualifiedPointCount,
    excludedRateCount,
    minRate: overallMin?.original ?? null,
    maxRate: overallMax?.original ?? null,
    range:
      overallMin && overallMax
        ? formatDecimal(absDecimalDiff(overallMax.decimal, overallMin.decimal))
        : null,
  });
}
