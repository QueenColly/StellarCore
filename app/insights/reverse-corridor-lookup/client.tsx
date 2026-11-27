'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CorridorSummaryInput, findReverseCorridorAssociations } from './logic';

interface Props {
  corridors: CorridorSummaryInput[];
  hasMorePages: boolean;
  failedPageFetch: boolean;
  isStale: boolean;
  errorMessage: string | null;
  sourceEndpoint: string;
  evaluatedAt: string;
}

export function ReverseCorridorLookupClient({
  corridors,
  hasMorePages,
  failedPageFetch,
  isStale,
  errorMessage,
  sourceEndpoint,
  evaluatedAt,
}: Props) {
  const [selectedSlug, setSelectedSlug] = useState<string>(corridors[0]?.slug ?? '');

  const result = useMemo(
    () =>
      findReverseCorridorAssociations({
        corridors,
        selectedSlug: selectedSlug || null,
        hasMorePages,
        failedPageFetch,
      }),
    [corridors, selectedSlug, hasMorePages, failedPageFetch],
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Reverse-Direction Corridor Lookup</h1>
        <p className="text-sm text-neutral-600">
          Checks whether the returned corridor directory contains a separately reviewed reverse-direction
          corridor using exact asset and country identifiers. Does not imply transfer execution or reversibility.
        </p>
        <dl className="flex flex-wrap gap-4 text-xs text-neutral-500">
          <div><dt className="inline font-medium">Source: </dt><dd className="inline">{sourceEndpoint}</dd></div>
          <div><dt className="inline font-medium">Evaluated at: </dt><dd className="inline">{evaluatedAt}</dd></div>
          <div><dt className="inline font-medium">Directory status: </dt><dd className="inline">{result.directoryIncomplete ? 'Incomplete / Partial pagination' : 'Complete'}</dd></div>
          {isStale && <div><dt className="inline font-medium">Freshness: </dt><dd className="inline">Stale fallback</dd></div>}
        </dl>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          API Error: {errorMessage}
        </div>
      )}

      {!errorMessage && corridors.length === 0 && (
        <p role="status" className="rounded border p-4 text-sm">
          Empty corridor directory returned.
        </p>
      )}

      {!errorMessage && corridors.length > 0 && (
        <>
          <div className="space-y-2">
            <label htmlFor="corridor-select" className="block text-sm font-medium">
              Select reviewed corridor
            </label>
            <select
              id="corridor-select"
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
              className="w-full rounded border p-2 text-sm"
            >
              {corridors.map((c, idx) => (
                <option key={`${c.slug}-${idx}`} value={c.slug}>
                  {c.sourceAsset} ({c.sourceCountry}) → {c.destinationAsset} ({c.destinationCountry}) [{c.slug}]
                </option>
              ))}
            </select>
          </div>

          <section aria-live="polite" className="space-y-3 rounded border p-4">
            <h2 className="text-base font-medium">Lookup Result</h2>
            <p className="text-sm">{result.message}</p>

            {result.matches.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {result.matches.map((match) => (
                  <li key={match.slug}>
                    <Link href={`/corridors/${encodeURIComponent(match.slug)}`} className="underline">
                      {match.sourceAsset} ({match.sourceCountry}) → {match.destinationAsset} ({match.destinationCountry})
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {result.duplicateSlugWarnings.length > 0 && (
              <p role="status" className="text-xs text-amber-800">
                Duplicate slug(s) detected and deduplicated: {result.duplicateSlugWarnings.join(', ')}
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}