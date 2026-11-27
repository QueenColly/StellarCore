import { auditReputationMetricAvailability, REPUTATION_METRIC_KEYS, ReputationEntryInput } from './logic';

const SOURCE_ENDPOINT = '/api/v1/reputation';

export default async function ReputationMetricAvailabilityPage() {
  const evaluatedAt = new Date().toISOString();
  let entries: ReputationEntryInput[] = [];
  let isStale = false;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}${SOURCE_ENDPOINT}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      errorMessage = `Public reputation endpoint returned HTTP ${res.status}.`;
    } else {
      const body = await res.json();
      entries = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      isStale = Boolean(body?.stale || res.headers.get('x-data-stale') === 'true');
    }
  } catch {
    errorMessage = 'Unable to reach public reputation endpoint.';
  }

  const audit = auditReputationMetricAvailability(entries, evaluatedAt);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Reputation Metric Availability</h1>
        <p className="text-sm text-neutral-600">
          Read-only field presence audit. Availability indicates a non-null returned field only—not
          correctness, outcomes, or trust. Zero counts as present; missing fields are never coerced to zero.
        </p>
        <dl className="flex flex-wrap gap-4 text-xs text-neutral-500">
          <div><dt className="inline font-medium">Source: </dt><dd className="inline">{SOURCE_ENDPOINT}</dd></div>
          <div><dt className="inline font-medium">Evaluated at: </dt><dd className="inline">{audit.evaluatedAt}</dd></div>
          <div><dt className="inline font-medium">Freshness: </dt><dd className="inline">{isStale ? 'Stale fallback' : 'Current response'}</dd></div>
        </dl>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          API Error: {errorMessage}
        </div>
      )}

      {!errorMessage && isStale && (
        <div role="status" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Displaying stale fallback evidence. Availability counts reflect the last cached payload.
        </div>
      )}

      {!errorMessage && audit.totalAnchors === 0 && (
        <p role="status" className="rounded border p-4 text-sm">
          Empty reputation list returned. No anchor records available to audit.
        </p>
      )}

      {!errorMessage && audit.totalAnchors > 0 && (
        <>
          <section aria-labelledby="aggregate-heading" className="space-y-2">
            <h2 id="aggregate-heading" className="text-lg font-medium">
              Aggregate Metric Availability ({audit.totalAnchors} anchors)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {REPUTATION_METRIC_KEYS.map((key) => (
                <div key={key} className="rounded border p-3 text-sm">
                  <div className="font-mono text-xs text-neutral-600">{key}</div>
                  <div className="mt-1 text-lg font-semibold">
                    {audit.aggregateCounts[key]} / {audit.totalAnchors}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="per-anchor-heading" className="overflow-x-auto">
            <h2 id="per-anchor-heading" className="mb-2 text-lg font-medium">Per-Anchor Field Presence</h2>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="p-2">Anchor</th>
                  <th scope="col" className="p-2">Evidence State</th>
                  <th scope="col" className="p-2">Computed At</th>
                  {REPUTATION_METRIC_KEYS.map((k) => (
                    <th key={k} scope="col" className="p-2 font-mono text-xs">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.rows.map((row) => (
                  <tr key={row.anchorSlug} className="border-b">
                    <td className="p-2 font-medium">{row.anchorName}</td>
                    <td className="p-2">{row.evidenceState}</td>
                    <td className="p-2 font-mono text-xs">{row.computedAt ?? 'Unavailable'}</td>
                    {REPUTATION_METRIC_KEYS.map((k) => {
                      const cell = row.fields[k];
                      return (
                        <td key={k} className="p-2 font-mono text-xs">
                          {cell.presence === 'PRESENT'
                            ? `Present (${cell.rawValue})`
                            : cell.presence === 'METRICS_OBJECT_UNAVAILABLE'
                              ? 'Metrics unavailable'
                              : 'Null'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}