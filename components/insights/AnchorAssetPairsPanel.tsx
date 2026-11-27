"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  summarizeAnchorAssetPairs,
  type AnchorAssetPairGroup,
} from "@/lib/api/anchorAssetPairs";
import type {
  PublicAnchorDetail,
  PublicAnchorSummary,
} from "@/types/api/anchors";

type Props = Readonly<{
  anchors: readonly PublicAnchorSummary[];
  selectedSlug: string | null;
  anchorDetail: PublicAnchorDetail | null;
}>;

const HONEST_LABEL =
  "Reviewed registry membership only: corridor rows persisted on this anchor. This view does not treat them as current routes or executable payment claims.";

export function AnchorAssetPairsPanel({
  anchors,
  selectedSlug,
  anchorDetail,
}: Props) {
  const router = useRouter();
  const groups = anchorDetail
    ? summarizeAnchorAssetPairs(anchorDetail)
    : [];

  function handleSelect(event: Readonly<{ target: { value: string } }>): void {
    const value = event.target.value;
    if (value) {
      router.push(
        `/insights/anchor-asset-pairs?anchor=${encodeURIComponent(value)}`,
      );
    }
  }

  return (
    <section
      aria-labelledby="anchor-asset-pairs-heading"
      className="mt-10"
      data-testid="anchor-asset-pairs-panel"
    >
      <div>
        <p className="eyebrow">Anchor intelligence</p>
        <h2
          id="anchor-asset-pairs-heading"
          className="mt-2 text-2xl"
          style={{ fontFamily: "var(--display)" }}
        >
          Reviewed asset-pair footprint
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          {HONEST_LABEL}
        </p>
      </div>

      {anchors.length === 0 ? (
        <p
          className="mt-6 text-sm text-[var(--muted)]"
          data-testid="anchor-asset-pairs-empty"
        >
          No reviewed anchors are currently recorded.
        </p>
      ) : (
        <div className="mt-5">
          <label
            className="text-xs uppercase tracking-wide text-[var(--muted)]"
            htmlFor="anchor-asset-pairs-select"
          >
            Select anchor
          </label>
          <select
            id="anchor-asset-pairs-select"
            className="mt-2 rounded border border-[var(--ghost)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="Anchor"
            value={selectedSlug ?? ""}
            onChange={handleSelect}
          >
            {anchors.map((anchor) => (
              <option key={anchor.slug} value={anchor.slug}>
                {anchor.name || anchor.slug}
              </option>
            ))}
          </select>
        </div>
      )}

      {anchorDetail ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3
              className="text-lg text-[var(--white)]"
              style={{ fontFamily: "var(--display)" }}
            >
              {anchorDetail.name || anchorDetail.slug}
            </h3>
            <Link
              href={`/anchors/${anchorDetail.slug}`}
              className="font-mono text-xs text-[var(--accent)]"
            >
              {anchorDetail.slug}
            </Link>
          </div>

          {groups.length === 0 ? (
            <p
              className="mt-5 text-sm text-[var(--muted)]"
              data-testid="anchor-asset-pairs-no-associations"
            >
              No reviewed corridor associations for this anchor.
            </p>
          ) : (
            <ul className="mt-5 space-y-5" aria-label="Reviewed asset pairs">
              {groups.map((group, index) => (
                <AssetPairGroup
                  key={`${group.sourceAsset}-${group.destinationAsset}-${index}`}
                  group={group}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function AssetPairGroup({
  group,
}: Readonly<{ group: AnchorAssetPairGroup }>) {
  return (
    <li
      className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4"
      data-testid="anchor-asset-pair-group"
    >
      <p className="text-sm font-medium text-[var(--white)]">
        {displayText(group.sourceAsset)} → {displayText(group.destinationAsset)}
      </p>
      {group.countryPairs.map((pair) => (
        <p
          key={`${pair.sourceCountry}|${pair.destinationCountry}`}
          className="mt-1 text-xs text-[var(--muted)]"
        >
          {displayText(pair.sourceCountry)} → {displayText(pair.destinationCountry)}
        </p>
      ))}
      {group.corridorSlugs.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {group.corridorSlugs.map((slug) => (
            <li key={slug}>
              <Link
                href={`/corridors/${slug}`}
                className="rounded border border-[var(--ghost)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent)] transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {slug}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function displayText(value: string): string {
  return value === "" ? "—" : value;
}
