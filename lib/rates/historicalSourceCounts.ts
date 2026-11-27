import type {
  PublicRateHistoryObservation,
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

const BUCKET_LABELS = Object.freeze(["0", "1", "2", "3+"] as const);
type BucketLabel = (typeof BUCKET_LABELS)[number];

export type SourceCountBucket = Readonly<{
  label: BucketLabel;
  distinctAnchorCount: number;
  count: number;
  percent: number | null;
  pointIndices: readonly number[];
}>;

export type SourceCountMismatch = Readonly<{
  timestamp: string;
  index: number;
  reportedSourceCount: number;
  observedDistinctAnchorCount: number;
}>;

export type HistoricalSourceCounts = Readonly<{
  corridor: PublicRateHistoryResponse["corridor"];
  evaluatedAt: string;
  windowDays: number;
  totalPoints: number;
  buckets: readonly SourceCountBucket[];
  mismatches: readonly SourceCountMismatch[];
  empty: boolean;
}>;

function distinctAnchorSlugs(point: PublicRateHistoryPoint): readonly string[] {
  const seen = new Set<string>();
  for (const observation of point.observations) {
    const slug = String(observation.anchor.slug ?? "").trim();
    if (slug.length === 0) continue;
    seen.add(slug);
  }
  return Object.freeze([...seen]);
}

function bucketForCount(distinctCount: number): BucketLabel {
  if (distinctCount === 0) return "0";
  if (distinctCount === 1) return "1";
  if (distinctCount === 2) return "2";
  return "3+";
}

/**
 * Pure, read-only distribution of distinct observed anchor participation per
 * snapshot. Counts derive solely from deduplicated anchor slugs in each point's
 * observations; `sourceCount` mismatches are surfaced as data-quality warnings
 * and never used to correct the API.
 */
export function computeHistoricalSourceCounts(
  response: PublicRateHistoryResponse,
): HistoricalSourceCounts {
  const { points, evaluatedAt, windowDays, corridor } = response;
  const totalPoints = points.length;
  type MutableBucket = {
    label: BucketLabel;
    distinctAnchorCount: number;
    count: number;
    pointIndices: number[];
  };
  const makeBucket = (label: BucketLabel): MutableBucket => ({
    label,
    distinctAnchorCount: label === "3+" ? 3 : Number(label),
    count: 0,
    pointIndices: [],
  });
  const buckets: Record<BucketLabel, MutableBucket> = {
    "0": makeBucket("0"),
    "1": makeBucket("1"),
    "2": makeBucket("2"),
    "3+": makeBucket("3+"),
  };

  const mismatches: SourceCountMismatch[] = [];

  points.forEach((point, index) => {
    const slugs = distinctAnchorSlugs(point);
    const distinctCount = slugs.length;
    const label = bucketForCount(distinctCount);
    const bucket = buckets[label];
    bucket.count += 1;
    bucket.pointIndices.push(index);

    const reported = Number.isFinite(point.sourceCount) ? point.sourceCount : null;
    if (reported !== null && reported !== distinctCount) {
      mismatches.push({
        timestamp: String(point.timestamp),
        index,
        reportedSourceCount: reported,
        observedDistinctAnchorCount: distinctCount,
      });
    }
  });

  const finalBuckets = BUCKET_LABELS.map((label) => {
    const bucket = buckets[label];
    const percent =
      totalPoints === 0 ? null : (bucket.count / totalPoints) * 100;
    return Object.freeze({
      ...bucket,
      pointIndices: Object.freeze([...bucket.pointIndices]),
      percent,
    });
  });

  return Object.freeze({
    corridor,
    evaluatedAt,
    windowDays,
    totalPoints,
    buckets: Object.freeze(finalBuckets),
    mismatches: Object.freeze(mismatches),
    empty: totalPoints === 0,
  });
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function describeBucket(label: BucketLabel): string {
  switch (label) {
    case "0":
      return "No anchor observations";
    case "1":
      return "One distinct anchor";
    case "2":
      return "Two distinct anchors";
    case "3+":
      return "Three or more distinct anchors";
  }
}

export function describeMismatch(m: SourceCountMismatch): string {
  return `Snapshot at ${m.timestamp} reported sourceCount ${m.reportedSourceCount} but ${m.observedDistinctAnchorCount} distinct anchor slug${m.observedDistinctAnchorCount === 1 ? " was" : "s were"} observed.`;
}

export function isNonEmptySlug(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
