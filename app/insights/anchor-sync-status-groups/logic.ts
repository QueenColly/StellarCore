export const KNOWN_SYNC_STATUSES = ['LIVE', 'DEGRADED', 'DOWN', 'UNKNOWN'] as const;
export type KnownSyncStatus = (typeof KNOWN_SYNC_STATUSES)[number];
export type SyncStatusBucketKey = KnownSyncStatus | 'UNEXPECTED';

export interface AnchorSummaryInput {
  slug: string;
  name: string;
  syncStatus: string;
  lastSyncedAt?: string | null;
}

export interface GroupedAnchorsResult {
  groups: Record<SyncStatusBucketKey, AnchorSummaryInput[]>;
  unexpectedValues: string[];
  duplicateSlugs: string[];
  totalUniqueAnchors: number;
  directoryIncomplete: boolean;
}

export function groupAnchorsByPersistedSyncStatus(params: {
  anchors: readonly AnchorSummaryInput[];
  hasMorePages: boolean;
  failedPageFetch?: boolean;
}): GroupedAnchorsResult {
  const groups: Record<SyncStatusBucketKey, AnchorSummaryInput[]> = {
    LIVE: [],
    DEGRADED: [],
    DOWN: [],
    UNKNOWN: [],
    UNEXPECTED: [],
  };

  const seenSlugs = new Set<string>();
  const duplicateSlugs = new Set<string>();
  const unexpectedValues = new Set<string>();

  for (const anchor of params.anchors) {
    const slug = anchor.slug.trim();
    if (seenSlugs.has(slug)) {
      duplicateSlugs.add(slug);
      continue;
    }
    seenSlugs.add(slug);

    if ((KNOWN_SYNC_STATUSES as readonly string[]).includes(anchor.syncStatus)) {
      groups[anchor.syncStatus as KnownSyncStatus].push(anchor);
    } else {
      unexpectedValues.add(String(anchor.syncStatus));
      groups.UNEXPECTED.push(anchor);
    }
  }

  return {
    groups,
    unexpectedValues: Array.from(unexpectedValues),
    duplicateSlugs: Array.from(duplicateSlugs),
    totalUniqueAnchors: seenSlugs.size,
    directoryIncomplete: params.hasMorePages || Boolean(params.failedPageFetch),
  };
}