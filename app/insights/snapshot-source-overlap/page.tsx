import type { Metadata } from "next";
import Link from "next/link";
import { SnapshotSourceOverlapPanel } from "@/components/insights/SnapshotSourceOverlapPanel";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";

type SearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

type Props = Readonly<{ searchParams: Promise<SearchParams> }>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Snapshot source overlap — StellarCore",
  description:
    "Read-only view of anchors recorded together within individual rate snapshots on a corridor.",
};

function paramValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function SnapshotSourceOverlapPage({
  searchParams,
}: Props) {
  const params = await searchParams;
  const result = await getRateHistoryApiResult(
    paramValue(params.corridor),
    paramValue(params.days),
  );

  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
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
            <span aria-hidden="true" className="px-2">
              /
            </span>
            <span aria-current="page">Snapshot source overlap</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Historical intelligence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Concurrent anchor observations in rate snapshots
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Read-only, per-snapshot anchor co-observation from the corridor
              rate-history API. Facts are drawn only from the persisted public
              history response.
            </p>
          </header>

          {result.status !== 200 ? (
            <div
              className="mt-8 max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-sm text-[#ee8f81]"
              role="alert"
            >
              {result.body.error.message}
            </div>
          ) : (
            <SnapshotSourceOverlapPanel
              history={result.body}
              stale={result.degraded}
            />
          )}
        </div>
      </main>
    </>
  );
}
