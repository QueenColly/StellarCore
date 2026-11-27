'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AnchorSummaryInput,
  groupAnchorsByPersistedSyncStatus,
  SyncStatusBucketKey,
} from './logic';

const FILTER_OPTIONS: Array<{ key: 'ALL' | SyncStatusBucketKey; label: string }> = [
  { key: 'ALL', label: 'All statuses' },
  { key: 'LIVE', label: 'LIVE' },
  { key: 'DEGRADED', label: 'DEGRADED' },
  { key: 'DOWN', label: 'DOWN' },
  { key: 'UNKNOWN', label: 'UNKNOWN' },
  { key: 'UNEXPECTED', label: 'UNEXPECTED' },
];

interface Props {
  anchors: AnchorSummaryInput[];
  hasMorePages: boolean;
  failedPageFetch: boolean;
  isStale: boolean;
  errorMessage: string | null;
  sourceEndpoint: string;
  evaluatedAt: string;
}

export function AnchorSyncStatusGroupsClient({
  anchors,
  hasMorePages,
  failedPageFetch,
  isStale,
  errorMessage,
  sourceEndpoint,
  evaluatedAt,
}: Props) {
  const [activeFilter, setActiveFilter] = useState<'ALL' | SyncStatusBucketKey>('ALL');

  const grouped = useMemo(
    () => groupAnchorsByPersistedSyncStatus({ anchors, hasMorePages, failedPageFetch }),
    [anchors, hasMorePages, failedPageFetch],
  );

  const visibleBuckets: SyncStatusBucketKey[] =
    activeFilter === 'ALL'
      ? (['LIVE', 'DEGRADED', 'DOWN', 'UNKNOWN', ...(grouped.groups.UNEXPECTED.length > 0 ? ['UNEXPECTED' as const] : [])])
      : [activeFilter];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Anchor Persisted Sync Status Groups</h1>
        <p role="note" className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
          Notice: Statuses below reflect the <strong>last synchronized state</strong> persisted in the
          public directory—not monitored live uptime or real-time endpoint health.
        </p>
        <dl className="flex flex-wrap gap-4 text-xs text-neutral-500">
          <div><dt className="inline font-medium">Source: </dt><dd className="inline">{sourceEndpoint}</dd></div>
          <div><dt className="inline font-medium">Evaluated at: </dt><dd className="inline">{evaluatedAt}</dd></div>
          <div><dt className="inline font-medium">Directory: </dt><dd className="inline">{grouped.directoryIncomplete ? 'Incomplete (partial pages)' : 'Complete'}</dd></div>
          {isStale && <div><dt className="inline font-medium">Freshness: </dt><dd className="inline">Stale fallback</dd></div>}
        </dl>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          API Error: {errorMessage}
        </div>
      )}

      {!errorMessage && grouped.totalUniqueAnchors === 0 && (
        <p role="status" className="rounded border p-4 text-sm">Empty anchor directory returned.</p>
      )}

      {!errorMessage && grouped.totalUniqueAnchors > 0 && (
        <>
          <div role="group" aria-label="Filter anchors by persisted sync status" className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((opt) => {
              if (opt.key === 'UNEXPECTED' && grouped.groups.UNEXPECTED.length === 0) return null;
              const count =
                opt.key === 'ALL' ? grouped.totalUniqueAnchors : grouped.groups[opt.key].length;
              const pressed = activeFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setActiveFilter(opt.key)}
                  className={`rounded border px-3 py-1.5 text-sm ${pressed ? 'bg-neutral-900 text-white' : 'bg-white'}`}
                >
                  {opt.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            {visibleBuckets.map((bucket) => (
              <section key={bucket} aria-labelledby={`bucket-${bucket}`} className="rounded border p-4">
                <h2 id={`bucket-${bucket}`} className="text-base font-medium">
                  {bucket} ({grouped.groups[bucket].length})
                </h2>
                {grouped.groups[bucket].length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-500">No anchors in this status group.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {grouped.groups[bucket].map((anchor) => (
                      <li key={anchor.slug} className="flex items-center justify-between border-t py-1.5">
                        <Link href={`/anchors/${encodeURIComponent(anchor.slug)}`} className="underline">
                          {anchor.name}
                        </Link>
                        <span className="font-mono text-xs text-neutral-500">
                          {bucket === 'UNEXPECTED' ? `raw: ${anchor.syncStatus}` : anchor.slug}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}