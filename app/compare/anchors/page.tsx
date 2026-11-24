"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicAnchorSummary, PublicAnchorStatus } from "@/types/api/anchors";
import { loadPublicAnchors } from "@/lib/watchlist/publicDirectories";

function syncLabel(status: PublicAnchorStatus): string {
  switch (status) {
    case "LIVE": return "Last sync successful";
    case "DEGRADED": return "Last sync degraded";
    case "DOWN": return "Last sync failed";
    case "UNKNOWN": return "Last sync unknown";
  }
}

function AnchorFacts({ anchor }: { anchor: PublicAnchorSummary }) {
  return (
    <article className="rounded-lg border border-[var(--ghost)] p-4">
      <h3 className="text-lg font-medium text-[var(--white)]">
        <Link className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={`/anchors/${anchor.slug}`}>
          {anchor.name}
        </Link>
      </h3>
      <dl className="mt-4 grid gap-3 text-sm">
        <div><dt className="text-[var(--muted)]">Home domain</dt><dd className="break-all">{anchor.homeDomain}</dd></div>
        <div><dt className="text-[var(--muted)]">Synchronization status</dt><dd>{syncLabel(anchor.status)}</dd></div>
        <div><dt className="text-[var(--muted)]">Advertised SEPs</dt><dd>{anchor.seps.length ? anchor.seps.map((sep) => `SEP-${sep}`).join(", ") : "None advertised"}</dd></div>
        <div><dt className="text-[var(--muted)]">Transfer interface</dt><dd>{anchor.isTransferCapable ? "Transfer interface advertised" : "No transfer interface advertised"}</dd></div>
        <div><dt className="text-[var(--muted)]">Reviewed corridor count</dt><dd>{anchor.corridorCount}</dd></div>
      </dl>
    </article>
  );
}

/** Testable pure view: only existing, persisted public anchor summaries are compared. */
export function AnchorComparison({ first, second }: { first: PublicAnchorSummary; second: PublicAnchorSummary }) {
  return (
    <section id="comparison-result" aria-labelledby="anchor-comparison-heading" className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6">
      <h2 id="anchor-comparison-heading" className="mb-5 text-lg text-[var(--white)]">
        Comparison: {first.name} vs {second.name}
      </h2>
      <div className="grid gap-5 md:grid-cols-2">
        <AnchorFacts anchor={first} />
        <AnchorFacts anchor={second} />
      </div>
      <p className="mt-5 border-t border-[var(--ghost)] pt-4 text-sm text-[var(--muted)]">
        Configuration data from persisted public evidence. No price, rate, liquidity, or operational claims.
        Synchronization reflects the last recorded result, not live availability.
      </p>
    </section>
  );
}

export default function CompareAnchorsPage() {
  const [anchors, setAnchors] = useState<readonly PublicAnchorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");
  const [comparison, setComparison] = useState<{ a: string; b: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadPublicAnchors(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setAnchors(result.items);
      else setError(result.message);
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const first = anchors.find((anchor) => anchor.slug === comparison?.a);
  const second = anchors.find((anchor) => anchor.slug === comparison?.b);
  const canCompare = selectedA !== "" && selectedB !== "" && selectedA !== selectedB;

  return (
    <main id="main-content" className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm">
          <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Dashboard</Link>
          <span aria-hidden="true" className="px-2">/</span><span aria-current="page">Compare anchors</span>
        </nav>
        <header>
          <p className="eyebrow">Anchor comparison</p>
          <h1 className="mt-2 text-3xl sm:text-4xl">Compare two anchors</h1>
          <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">
            Compare reviewed identities, persisted synchronization state, advertised SEPs, and corridor associations.
            No price, rate, liquidity, or live operational claims are made.
          </p>
        </header>
        <section className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6" aria-labelledby="anchor-select-heading">
          <h2 id="anchor-select-heading" className="mb-4 text-lg">Select anchors</h2>
          {loading ? <p role="status" className="text-sm text-[var(--muted)]">Loading reviewed anchors…</p> : null}
          {error ? <p role="alert" className="text-sm text-[var(--muted)]">{error} This is a read failure, not evidence that no anchors exist.</p> : null}
          {!loading && !error && anchors.length === 0 ? <p className="text-sm text-[var(--muted)]">No reviewed anchors are currently persisted.</p> : null}
          <form className="mt-5 space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (canCompare) setComparison({ a: selectedA, b: selectedB });
          }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="anchor-compare-a" className="mb-2 block text-sm">Anchor A</label>
                <select id="anchor-compare-a" aria-label="Anchor A" value={selectedA} disabled={loading || !!error || anchors.length < 2}
                  onChange={(event) => { setSelectedA(event.target.value); setComparison(null); }}
                  className="w-full rounded border border-[var(--ghost)] bg-[var(--surface)] p-2 text-[var(--white)] focus-visible:outline-2">
                  <option value="">Select an anchor...</option>
                  {anchors.map((anchor) => <option key={anchor.slug} value={anchor.slug}>{anchor.name} ({anchor.slug})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="anchor-compare-b" className="mb-2 block text-sm">Anchor B</label>
                <select id="anchor-compare-b" aria-label="Anchor B" value={selectedB} disabled={loading || !!error || anchors.length < 2}
                  onChange={(event) => { setSelectedB(event.target.value); setComparison(null); }}
                  className="w-full rounded border border-[var(--ghost)] bg-[var(--surface)] p-2 text-[var(--white)] focus-visible:outline-2">
                  <option value="">Select an anchor...</option>
                  {anchors.map((anchor) => <option key={anchor.slug} value={anchor.slug}>{anchor.name} ({anchor.slug})</option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={!canCompare || loading || !!error}
              className="rounded border border-[var(--accent)] px-4 py-2 text-sm text-[var(--white)] focus-visible:outline-2 disabled:opacity-50">
              Compare
            </button>
          </form>
        </section>
        {first && second ? <AnchorComparison first={first} second={second} /> : null}
      </div>
    </main>
  );
}
