"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicCorridor } from "@/types/api/corridors";
import { CorridorComparison } from "@/components/compare/CorridorComparison";
import { loadPublicCorridors } from "@/lib/watchlist/publicDirectories";

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
