import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import type { PublicCorridor } from "@/types/api/corridors";
import { getCorridorsApiResult } from "@/lib/api/corridors";

type CountBin = "0" | "1" | "2" | "3-plus";

function countBin(anchorCount: number): CountBin {
  if (anchorCount === 0) return "0";
  if (anchorCount === 1) return "1";
  if (anchorCount === 2) return "2";
  return "3-plus";
}

function isValidAnchorCount(count: number): boolean {
  return Number.isInteger(count) && count >= 0;
}

export const metadata: Metadata = {
  title: "Reviewed corridor membership counts — StellarCore",
  description:
    "Distribution of reviewed corridor records by associated anchor count: how many corridors have 0, 1, 2, or 3+ configured anchors. Does not imply any anchor is connected or quote at this moment.",
};

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="text-xs text-[var(--muted)]"
          >
            <Link
              href="/dashboard"
              className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              Dashboard
            </Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span aria-current="page">Reviewed corridor membership counts</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Reviewed registry</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Membership count distribution
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Corridors are reviewed registry entries that associate an asset pair with a
              country path. This page groups them by how many configured anchors each has,
              without implying any anchor is currently connected or quoting at this moment.
            </p>
          </header>

          {children}
        </div>
      </main>
    </>
  );
}

/** Fetch all corridors, deduplicating by slug. Returns corridors array. */
async function fetchAllCorridors(): Promise<readonly PublicCorridor[]> {
  const result = await getCorridorsApiResult();

  if (result.status !== 200) {
    return [];
  }

  const corridors = result.body.corridors;

  // Deduplicate by slug, keeping first occurrence
  const seen = new Set<string>();
  const deduped: PublicCorridor[] = [];

  for (const corridor of corridors) {
    if (!seen.has(corridor.slug)) {
      seen.add(corridor.slug);
      deduped.push(corridor);
    }
  }

  return deduped as readonly PublicCorridor[];
}

interface GroupedCorridors {
  zero: readonly PublicCorridor[];
  one: readonly PublicCorridor[];
  two: readonly PublicCorridor[];
  many: readonly PublicCorridor[];
}

function groupByAnchorCount(
  corridors: readonly PublicCorridor[],
): GroupedCorridors {
  const zero: PublicCorridor[] = [];
  const one: PublicCorridor[] = [];
  const two: PublicCorridor[] = [];
  const many: PublicCorridor[] = [];

  for (const corridor of corridors) {
    if (!isValidAnchorCount(corridor.anchorCount)) {
      // Guard invalid/negative counts - treat as unknown and skip grouping
      continue;
    }

    const bin = countBin(corridor.anchorCount);
    switch (bin) {
      case "0":
        zero.push(corridor);
        break;
      case "1":
        one.push(corridor);
        break;
      case "2":
        two.push(corridor);
        break;
      case "3-plus":
        many.push(corridor);
        break;
    }
  }

  return {
    zero: Object.freeze(zero) as readonly PublicCorridor[],
    one: Object.freeze(one) as readonly PublicCorridor[],
    two: Object.freeze(two) as readonly PublicCorridor[],
    many: Object.freeze(many) as readonly PublicCorridor[],
  };
}

interface AllCorridorsResult {
  status: "ok" | "error";
  corridors: readonly PublicCorridor[];
  group: GroupedCorridors;
  rawAnchorCounts: number[];
  errorMessage?: string;
}

async function loadAll(): Promise<AllCorridorsResult> {
  const corridors = await fetchAllCorridors();

  if (corridors.length === 0) {
    // Could be empty directory or API error - we'll treat as ok with empty data
    // and let the UI handle the empty state
    return {
      status: "ok",
      corridors: [],
      group: {
        zero: [],
        one: [],
        two: [],
        many: [],
      },
      rawAnchorCounts: [],
    };
  }

  const group = groupByAnchorCount(corridors);
  const rawAnchorCounts = [...new Set(corridors.map((c) => c.anchorCount).filter(isValidAnchorCount))];

  return {
    status: "ok",
    corridors,
    group,
    rawAnchorCounts,
    errorMessage: undefined,
  };
}

export default async function ReviewedCorridorMembershipCountsPage() {
  const all = await loadAll();

  return (
    <PageShell>
      <section
        aria-label="Membership count distribution"
        className="mt-8"
      >
        {/* Error state */}
        {all.status === "error" && (
          <div
            role="alert"
            className="mt-8 rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Unavailable</p>
            <p className="mt-2">
              Unable to load reviewed corridors:{" "}{all.errorMessage}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              No membership count distribution is available at this time.
            </p>
          </div>
        )}

        {/* Empty state - no corridors */}
        {all.status === "ok" && all.corridors.length === 0 && (
          <div
            role="alert"
            className="mt-8 rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Empty directory</p>
            <p className="mt-2">No reviewed corridors were returned from the directory.</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              This may be due to pagination being incomplete or the directory being empty.
            </p>
          </div>
        )}

        {/* Content */}
        {all.status === "ok" && all.corridors.length > 0 && (
          <div className="mt-8">
            <p className="text-sm text-[var(--muted)] mb-4">
              Total distinct valid corridors: {all.corridors.length}
            </p>

            {/* Raw anchor counts display */}
            <div className="mt-4 mb-6">
              <p className="text-xs font-medium text-[var(--muted)] mb-2">
                Raw associated anchor counts observed
              </p>
              <div className="flex flex-wrap gap-2">
                {all.rawAnchorCounts.map((count) => (
                  <span
                    key={count}
                    className="inline-flex items-center px-2.5 py-0.5 rounded text-xxs font-medium border border-[var(--muted)] bg-[var(--black)] text-[var(--muted)]"
                  >
                    {count}
                  </span>
                ))}
              </div>
            </div>

            {/* Grouped membership bins */}
            {/* Bin 0: Zero configured anchors */}
            <div
              id="bin-zero"
              className="mt-8 space-y-6"
            >
              <h2
                id="bin-zero-heading"
                className="text-lg font-medium text-[var(--accent)]"
                role="button"
                aria-expanded="true"
                aria-controls="bin-zero-content"
              >
                Zero associated anchors ({all.group.zero.length} corridor{
                  all.group.zero.length === 1 ? "" : "s"
                })
              </h2>
              <div
                id="bin-zero-content"
                className="space-y-3"
                aria-hidden="false"
              >
                <p className="text-xs text-[var(--muted)]">
                  Corridors with no configured associated anchors. These are reviewed registry
                  entries where the anchor count is 0.
                </p>
                {all.group.zero.map((corridor) => (
                  <div
                    key={corridor.slug}
                    className="flex items-start gap-3"
                  >
                    <Link
                      href={`/corridors/${corridor.slug}`}
                      className="text-sm hover:text-[var(--accent)] transition-colors"
                      aria-label={`View corridor details for ${corridor.slug}`}
                    >
                      <span className="font-medium">{corridor.slug}</span>
                    </Link>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--muted)]">
                        {corridor.sourceAsset} ({corridor.sourceCountry}) → {corridor.destinationAsset} ({corridor.destinationCountry})
                      </p>
                    </div>
                    <span
                      className="ml-2 text-xs font-medium bg-[var(--black)] text-[var(--muted)] rounded px-2 py-0.5"
                    >
                      0
                    </span>
                  </div>
                ))}
                {all.group.zero.length === 0 && (
                  <p className="text-xs text-[var(--muted)]">
                    None
                  </p>
                )}
              </div>
            </div>

            {/* Bin 1: One configured anchor */}
            <div
              id="bin-one"
              className="mt-8 space-y-6"
            >
              <h2
                id="bin-one-heading"
                className="text-lg font-medium text-[var(--accent)]"
                role="button"
                aria-expanded="true"
                aria-controls="bin-one-content"
              >
                One associated anchor ({all.group.one.length} corridor{
                  all.group.one.length === 1 ? "" : "s"
                })
              </h2>
              <div
                id="bin-one-content"
                className="space-y-3"
                aria-hidden="false"
              >
                <p className="text-xs text-[var(--muted)]">
                  Corridors with exactly one configured associated anchor.
                </p>
                {all.group.one.map((corridor) => (
                  <div
                    key={corridor.slug}
                    className="flex items-start gap-3"
                  >
                    <Link
                      href={`/corridors/${corridor.slug}`}
                      className="text-sm hover:text-[var(--accent)] transition-colors"
                      aria-label={`View corridor details for ${corridor.slug}`}
                    >
                      <span className="font-medium">{corridor.slug}</span>
                    </Link>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--muted)]">
                        {corridor.sourceAsset} ({corridor.sourceCountry}) → {corridor.destinationAsset} ({corridor.destinationCountry})
                      </p>
                    </div>
                    <span
                      className="ml-2 text-xs font-medium bg-[var(--black)] text-[var(--muted)] rounded px-2 py-0.5"
                    >
                      1
                    </span>
                  </div>
                ))}
                {all.group.one.length === 0 && (
                  <p className="text-xs text-[var(--muted)]">
                    None
                  </p>
                )}
              </div>
            </div>

            {/* Bin 2: Two configured anchors */}
            <div
              id="bin-two"
              className="mt-8 space-y-6"
            >
              <h2
                id="bin-two-heading"
                className="text-lg font-medium text-[var(--accent)]"
                role="button"
                aria-expanded="true"
                aria-controls="bin-two-content"
              >
                Two associated anchors ({all.group.two.length} corridor{
                  all.group.two.length === 1 ? "" : "s"
                })
              </h2>
              <div
                id="bin-two-content"
                className="space-y-3"
                aria-hidden="false"
              >
                <p className="text-xs text-[var(--muted)]">
                  Corridors with exactly two configured associated anchors.
                </p>
                {all.group.two.map((corridor) => (
                  <div
                    key={corridor.slug}
                    className="flex items-start gap-3"
                  >
                    <Link
                      href={`/corridors/${corridor.slug}`}
                      className="text-sm hover:text-[var(--accent)] transition-colors"
                      aria-label={`View corridor details for ${corridor.slug}`}
                    >
                      <span className="font-medium">{corridor.slug}</span>
                    </Link>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--muted)]">
                        {corridor.sourceAsset} ({corridor.sourceCountry}) → {corridor.destinationAsset} ({corridor.destinationCountry})
                      </p>
                    </div>
                    <span
                      className="ml-2 text-xs font-medium bg-[var(--black)] text-[var(--muted)] rounded px-2 py-0.5"
                    >
                      2
                    </span>
                  </div>
                ))}
                {all.group.two.length === 0 && (
                  <p className="text-xs text-[var(--muted)]">
                    None
                  </p>
                )}
              </div>
            </div>

            {/* Bin 3-plus: Three or more configured anchors */}
            <div
              id="bin-many"
              className="mt-8 space-y-6"
            >
              <h2
                id="bin-many-heading"
                className="text-lg font-medium text-[var(--accent)]"
                role="button"
                aria-expanded="true"
                aria-controls="bin-many-content"
              >
                Three or more associated anchors ({all.group.many.length} corridor{
                  all.group.many.length === 1 ? "" : "s"
                })
              </h2>
              <div
                id="bin-many-content"
                className="space-y-3"
                aria-hidden="false"
              >
                <p className="text-xs text-[var(--muted)]">
                  Corridors with three or more configured associated anchors. A high membership
                  count does not imply fresh independent SEP-38 price sources or operational
                  liquidity — it only reflects configured registry associations.
                </p>
                {all.group.many.map((corridor) => (
                  <div
                    key={corridor.slug}
                    className="flex items-start gap-3"
                  >
                    <Link
                      href={`/corridors/${corridor.slug}`}
                      className="text-sm hover:text-[var(--accent)] transition-colors"
                      aria-label={`View corridor details for ${corridor.slug}`}
                    >
                      <span className="font-medium">{corridor.slug}</span>
                    </Link>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--muted)]">
                        {corridor.sourceAsset} ({corridor.sourceCountry}) → {corridor.destinationAsset} ({corridor.destinationCountry})
                      </p>
                    </div>
                    <span
                      className="ml-2 text-xs font-medium bg-[var(--black)] text-[var(--muted)] rounded px-2 py-0.5"
                    >
                      3+
                    </span>
                  </div>
                ))}
                {all.group.many.length === 0 && (
                  <p className="text-xs text-[var(--muted)]">
                    None
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* No data state */}
        {all.status !== "ok" && (
          <div
            role="alert"
            className="mt-8 rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">No data</p>
            <p className="mt-2">
              No reviewed corridor membership count data is available. This may be due to
              the directory being unavailable, pagination being incomplete, or an API call
              having failed.
            </p>
          </div>
        )}
      </section>
    </PageShell>
  );
}