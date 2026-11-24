"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicCorridor } from "@/types/api/corridors";
import { loadPublicCorridors } from "@/lib/watchlist/publicDirectories";

function CorridorFacts({ corridor }: { corridor: PublicCorridor }) {
  return (
    <article className="rounded-lg border border-[var(--ghost)] p-4">
      <h3 className="text-lg font-medium text-[var(--white)]">
        <Link href={`/corridors/${corridor.slug}`}
          className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
          {corridor.sourceAsset} ({corridor.sourceCountry}) → {corridor.destinationAsset} ({corridor.destinationCountry})
        </Link>
      </h3>
      <dl className="mt-4 grid gap-3 text-sm">
        <div><dt className="text-[var(--muted)]">Source asset</dt><dd>{corridor.sourceAsset}</dd></div>
        <div><dt className="text-[var(--muted)]">Source country</dt><dd>{corridor.sourceCountry}</dd></div>
        <div><dt className="text-[var(--muted)]">Destination asset</dt><dd>{corridor.destinationAsset}</dd></div>
        <div><dt className="text-[var(--muted)]">Destination country</dt><dd>{corridor.destinationCountry}</dd></div>
        <div><dt className="text-[var(--muted)]">Associated anchors</dt><dd>{corridor.anchorCount}</dd></div>
      </dl>
    </article>
  );
}

/** Testable read-only comparison. No network rates or executable quotes. */
export function CorridorComparison({ first, second }: { first: PublicCorridor; second: PublicCorridor }) {
  return (
    <section id="comparison-result" aria-labelledby="corridor-comparison-heading"
      className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6">
      <h2 id="corridor-comparison-heading" className="mb-5 text-lg text-[var(--white)]">
        Comparison: {first.slug} vs {second.slug}
      </h2>
      <div className="grid gap-5 md:grid-cols-2">
        <CorridorFacts corridor={first} />
        <CorridorFacts corridor={second} />
      </div>
      <p className="mt-5 border-t border-[var(--ghost)] pt-4 text-sm text-[var(--muted)]">
        Reviewed corridor configuration only. No price, rate, liquidity, or operational claims.
        Associated anchor counts do not prove current transfer availability.
      </p>
    </section>
  );
}

export default function CompareCorridorsPage() {
  const [corridors, setCorridors] = useState<readonly PublicCorridor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");
  const [comparison, setComparison] = useState<{ a: string; b: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadPublicCorridors(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setCorridors(result.items);
      else setError(result.message);
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const first = corridors.find((corridor) => corridor.slug === comparison?.a);
  const second = corridors.find((corridor) => corridor.slug === comparison?.b);
  const canCompare = selectedA !== "" && selectedB !== "" && selectedA !== selectedB;

  return (
    <main id="main-content" className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm">
          <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Dashboard</Link>
          <span aria-hidden="true" className="px-2">/</span><span aria-current="page">Compare corridors</span>
        </nav>
        <header>
          <p className="eyebrow">Corridor comparison</p>
          <h1 className="mt-2 text-3xl sm:text-4xl">Compare two corridors</h1>
          <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">
            Compare reviewed corridor identities, source and destination assets, countries and associated anchors.
            No price, rate, liquidity, or live operational claims are made.
          </p>
        </header>
        <section className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6" aria-labelledby="corridor-select-heading">
          <h2 id="corridor-select-heading" className="mb-4 text-lg">Select corridors</h2>
          {loading ? <p role="status" className="text-sm text-[var(--muted)]">Loading reviewed corridors…</p> : null}
          {error ? <p role="alert" className="text-sm text-[var(--muted)]">{error} This is a read failure, not proof of no corridors.</p> : null}
          {!loading && !error && corridors.length === 0 ? <p className="text-sm text-[var(--muted)]">No reviewed corridors are currently persisted.</p> : null}
          <form className="mt-5 space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (canCompare) setComparison({ a: selectedA, b: selectedB });
          }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="corridor-compare-a" className="mb-2 block text-sm">Corridor A</label>
                <select id="corridor-compare-a" aria-label="Corridor A" value={selectedA} disabled={loading || !!error || corridors.length < 2}
                  onChange={(event) => { setSelectedA(event.target.value); setComparison(null); }}
                  className="w-full rounded border border-[var(--ghost)] bg-[var(--surface)] p-2 text-[var(--white)] focus-visible:outline-2">
                  <option value="">Select a corridor...</option>
                  {corridors.map((corridor) => <option key={corridor.slug} value={corridor.slug}>
                    {corridor.sourceAsset} → {corridor.destinationAsset} ({corridor.slug})
                  </option>)}
                </select>
              </div>
              <div>
                <label htmlFor="corridor-compare-b" className="mb-2 block text-sm">Corridor B</label>
                <select id="corridor-compare-b" aria-label="Corridor B" value={selectedB} disabled={loading || !!error || corridors.length < 2}
                  onChange={(event) => { setSelectedB(event.target.value); setComparison(null); }}
                  className="w-full rounded border border-[var(--ghost)] bg-[var(--surface)] p-2 text-[var(--white)] focus-visible:outline-2">
                  <option value="">Select a corridor...</option>
                  {corridors.map((corridor) => <option key={corridor.slug} value={corridor.slug}>
                    {corridor.sourceAsset} → {corridor.destinationAsset} ({corridor.slug})
                  </option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={!canCompare || loading || !!error}
              className="rounded border border-[var(--accent)] px-4 py-2 text-sm text-[var(--white)] focus-visible:outline-2 disabled:opacity-50">
              Compare
            </button>
          </form>
        </section>
        {first && second ? <CorridorComparison first={first} second={second} /> : null}
      </div>
    </main>
  );
}
