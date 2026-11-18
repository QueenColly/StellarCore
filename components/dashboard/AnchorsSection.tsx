
import { getAnchorsApiResult, type AnchorsApiDependencies } from "@/lib/api/anchors";
import { advertisedCapabilities } from "@/lib/stellar/advertisedCapabilities";
import { SEPS } from "@/constants/seps";
import type { AnchorsApiResult, PublicAnchorStatus } from "@/types/api/anchors";
import { Badge } from "@/components/dashboard/Badge";
import { SectionEmpty, SectionError } from "@/components/dashboard/SectionStates";

function statusPresentation(status: PublicAnchorStatus) {
  switch (status) {
    case "LIVE":
      return { tone: "positive" as const, label: "Synced" };
    case "DEGRADED":
      return { tone: "warning" as const, label: "Sync degraded" };
    case "DOWN":
      return { tone: "negative" as const, label: "Sync failed" };
    case "UNKNOWN":
      return { tone: "neutral" as const, label: "Sync unknown" };
  }
}

export async function AnchorsSection({
  dependencies,
}: {
  dependencies?: AnchorsApiDependencies;
} = {}) {
  const result = await getAnchorsApiResult(dependencies);

  return <AnchorsSectionView result={result} />;
}

/** Pure render of an anchors API result; contract-tested against canonical fixtures. */
export function AnchorsSectionView({
  result,
}: Readonly<{ result: AnchorsApiResult }>) {
  if (result.status !== 200) {
    return <SectionError message={result.body.error.message} />;
  }

  const { anchors, count } = result.body;

  if (count === 0) {
    return <SectionEmpty message="No anchors are currently persisted." />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {anchors.map((anchor) => {
        const capabilities = advertisedCapabilities(anchor.seps);
        const hasSep38 = capabilities.some(({ sep }) => sep === SEPS.SEP_38);
        const syncStatus = statusPresentation(anchor.status);

        return (
          <article
            key={anchor.slug}
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  className="text-lg text-[var(--white)]"
                  style={{ fontFamily: "var(--display)" }}
                >
                  {anchor.name}
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {anchor.homeDomain}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                  {anchor.slug}
                </p>
              </div>
              <Badge tone={syncStatus.tone} label={syncStatus.label} />
            </div>

            <dl className="mt-4 flex items-center justify-between border-t border-[var(--ghost)] pt-3 text-xs">
              <div>
                <dt className="uppercase tracking-wide text-[var(--muted)]">
                  Advertised SEPs
                </dt>
                <dd className="mt-1 text-[var(--white)]">
                  {anchor.seps.length > 0 ? anchor.seps.join(", ") : "—"}
                </dd>
              </div>
              <div className="text-right">
                <dt className="uppercase tracking-wide text-[var(--muted)]">
                  Corridors
                </dt>
                <dd className="mt-1 text-[var(--white)]">
                  {anchor.corridorCount}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-[var(--ghost)] pt-3 text-xs">
              <Badge
                tone="neutral"
                label={
                  anchor.isTransferCapable
                    ? "Transfer interface advertised"
                    : "No transfer interface advertised"
                }
              />

              {capabilities.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-[var(--muted)]">
                  {capabilities.map((capability) => (
                    <li key={capability.sep}>{capability.label}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[var(--muted)]">
                  No approved SEP capability label is available.
                </p>
              )}

              {hasSep38 ? (
                <p className="mt-3 border-t border-[var(--ghost)] pt-3 text-[var(--muted)]">
                  SEP-38 advertisement does not establish a reviewed
                  indicative-rate source, current freshness, or a firm quote.
                </p>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
