"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicAnchorSummary } from "@/types/api/anchors";
import type { PublicCorridor } from "@/types/api/corridors";
import { loadPublicAnchors, loadPublicCorridors } from "@/lib/watchlist/publicDirectories";
import { createWatchlistStore, type WatchlistItem, type WatchlistStore } from "@/lib/watchlist";

export function SavedBookmarks({
  items, onRemove,
}: {
  items: readonly WatchlistItem[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No bookmarks yet. Select anchors or corridors below to add them.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ghost)] py-2">
          <Link href={item.type === "anchor" ? `/anchors/${item.slug}` : `/corridors/${item.slug}`}
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
            {item.name}
          </Link>
          <button type="button" onClick={() => onRemove(item.id)}
            className="rounded border border-[var(--ghost)] px-3 py-2 text-sm focus-visible:outline-2"
            aria-label={`Remove ${item.name} from watchlist`}>Remove</button>
        </li>
      ))}
    </ul>
  );
}

export default function WatchlistPage() {
  // Hydrate localStorage only after mount, avoiding server/client markup mismatches.
  const [watchlist, setWatchlist] = useState<WatchlistStore | null>(null);
  const [anchors, setAnchors] = useState<readonly PublicAnchorSummary[]>([]);
  const [corridors, setCorridors] = useState<readonly PublicCorridor[]>([]);
  const [anchorsLoading, setAnchorsLoading] = useState(true);
  const [corridorsLoading, setCorridorsLoading] = useState(true);
  const [anchorsError, setAnchorsError] = useState<string | null>(null);
  const [corridorsError, setCorridorsError] = useState<string | null>(null);

  useEffect(() => {
    setWatchlist(createWatchlistStore());
    const controller = new AbortController();

    void loadPublicAnchors(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setAnchors(result.items);
      else setAnchorsError(result.message);
      setAnchorsLoading(false);
    });
    void loadPublicCorridors(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setCorridors(result.items);
      else setCorridorsError(result.message);
      setCorridorsLoading(false);
    });
    return () => controller.abort();
  }, []);

  const add = (item: WatchlistItem) => {
    setWatchlist((store) => (store ?? createWatchlistStore()).add(item));
  };
  const remove = (id: string) => {
    setWatchlist((store) => (store ?? createWatchlistStore()).remove(id));
  };
  const isSaved = (id: string) => watchlist?.items.some((item) => item.id === id) ?? false;

  return (
    <main id="main-content" className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm">
          <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Dashboard</Link>
          <span aria-hidden="true" className="px-2">/</span><span aria-current="page">Watchlist</span>
        </nav>
        <header>
          <p className="eyebrow">Personal watchlist</p>
          <h1 className="mt-2 text-3xl sm:text-4xl">My anchors &amp; corridors</h1>
          <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">
            Save reviewed identities for quick revisiting. This is a bookmark list only.
            No automatic monitoring, alerts, or background synchronization.
          </p>
        </header>
        <section className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6" aria-labelledby="saved-bookmarks-heading">
          <h2 id="saved-bookmarks-heading" className="mb-4 text-lg">
            Saved bookmarks{watchlist ? ` (${watchlist.items.length})` : ""}
          </h2>
          {!watchlist
            ? <p role="status" className="text-sm text-[var(--muted)]">Loading saved bookmarks…</p>
            : <SavedBookmarks items={watchlist.items} onRemove={remove} />}
          <p className="mt-4 text-xs text-[var(--muted)]">
            Bookmarks persist only in this browser. Clearing browsing data will remove them.
            Stored bookmarks do not prove an anchor or corridor is currently available.
          </p>
        </section>

        <section className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6" aria-labelledby="add-anchors-heading">
          <h2 id="add-anchors-heading" className="mb-2 text-lg">Add anchors</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">Select anchors from the public list to bookmark.</p>
          {anchorsLoading ? <p role="status">Loading anchors…</p> : null}
          {anchorsError ? <p role="alert">{anchorsError} Previously saved bookmarks remain available.</p> : null}
          {!anchorsLoading && !anchorsError && anchors.length === 0 ? <p>No reviewed anchors are currently persisted.</p> : null}
          {anchors.length ? (
            <div className="overflow-x-auto" role="region" aria-label="Reviewed anchors" tabIndex={0}>
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead><tr className="border-b border-[var(--ghost)]">
                  <th scope="col" className="p-3">Name</th><th scope="col" className="p-3">Home domain</th><th scope="col" className="p-3">Action</th>
                </tr></thead>
                <tbody>{anchors.map((anchor) => {
                  const id = `anchor-${anchor.slug}`;
                  return <tr key={id} className="border-b border-[var(--ghost)]">
                    <td className="p-3"><Link href={`/anchors/${anchor.slug}`} className="underline underline-offset-4">{anchor.name}</Link></td>
                    <td className="break-all p-3 text-[var(--muted)]">{anchor.homeDomain}</td>
                    <td className="p-3"><button type="button" disabled={!watchlist || isSaved(id)} onClick={() => add({ id, type: "anchor", slug: anchor.slug, name: anchor.name })}
                      className="rounded border border-[var(--ghost)] px-3 py-2 focus-visible:outline-2 disabled:opacity-50" aria-label={`Add ${anchor.name} to watchlist`}>
                      {isSaved(id) ? "Saved" : "Add"}
                    </button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6" aria-labelledby="add-corridors-heading">
          <h2 id="add-corridors-heading" className="mb-2 text-lg">Add corridors</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">Select corridors from the public list to bookmark.</p>
          {corridorsLoading ? <p role="status">Loading corridors…</p> : null}
          {corridorsError ? <p role="alert">{corridorsError} Previously saved bookmarks remain available.</p> : null}
          {!corridorsLoading && !corridorsError && corridors.length === 0 ? <p>No reviewed corridors are currently persisted.</p> : null}
          {corridors.length ? (
            <div className="overflow-x-auto" role="region" aria-label="Reviewed corridors" tabIndex={0}>
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead><tr className="border-b border-[var(--ghost)]">
                  <th scope="col" className="p-3">Source</th><th scope="col" className="p-3">Destination</th><th scope="col" className="p-3">Action</th>
                </tr></thead>
                <tbody>{corridors.map((corridor) => {
                  const id = `corridor-${corridor.slug}`;
                  const label = `${corridor.sourceAsset} (${corridor.sourceCountry}) → ${corridor.destinationAsset} (${corridor.destinationCountry})`;
                  return <tr key={id} className="border-b border-[var(--ghost)]">
                    <td className="p-3"><Link href={`/corridors/${corridor.slug}`} className="underline underline-offset-4">{corridor.sourceAsset} · {corridor.sourceCountry}</Link></td>
                    <td className="p-3">{corridor.destinationAsset} · {corridor.destinationCountry}</td>
                    <td className="p-3"><button type="button" disabled={!watchlist || isSaved(id)} onClick={() => add({ id, type: "corridor", slug: corridor.slug, name: label })}
                      className="rounded border border-[var(--ghost)] px-3 py-2 focus-visible:outline-2 disabled:opacity-50" aria-label={`Add ${label} to watchlist`}>
                      {isSaved(id) ? "Saved" : "Add"}
                    </button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
