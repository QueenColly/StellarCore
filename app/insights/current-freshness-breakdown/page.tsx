import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRatesApiResult } from "@/lib/api/rates";
import { CurrentFreshnessBreakdownView } from "./CurrentFreshnessBreakdownView";

type Props = Readonly<{
  searchParams?: Promise<Readonly<{ corridor?: string }>>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Current Freshness Breakdown — StellarCore",
  description:
    "Read-only breakdown of the latest rate observations grouped by the API's explicit freshness states: fresh, stale, future, and invalid.",
};

export default async function CurrentFreshnessBreakdownPage({
  searchParams,
}: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const corridorsResult = await getCorridorsApiResult();
  const corridors = corridorsResult.status === 200 ? corridorsResult.body.corridors : [];
  const corridorsError =
    corridorsResult.status === 200 ? null : corridorsResult.body.error.message;

  const selectedCorridorSlug =
    resolvedParams.corridor && corridors.some((c) => c.slug === resolvedParams.corridor)
      ? resolvedParams.corridor
      : (corridors[0]?.slug ?? null);

  const ratesResult = selectedCorridorSlug
    ? await getRatesApiResult(selectedCorridorSlug)
    : null;

  const initialRates = ratesResult?.status === 200 ? ratesResult.body : null;
  const initialError =
    ratesResult && ratesResult.status !== 200 ? ratesResult.body.error.message : null;

  return (
    <>
      <ProductHeader current="insights" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted)]">
            <Link
              href="/dashboard"
              className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              Dashboard
            </Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span aria-current="page">Current Freshness Breakdown</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Rate Intelligence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Current freshness breakdown
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Groups the latest persisted rate observations for one reviewed corridor by the API&apos;s
              explicit freshness states — fresh, stale, future, and invalid. Counts derive solely
              from the API&apos;s classifications; no status is recomputed against the browser clock and
              no median is inferred.
            </p>
          </header>

          <section aria-labelledby="freshness-breakdown-heading" className="mt-8">
            <h2 id="freshness-breakdown-heading" className="sr-only">
              Current freshness breakdown
            </h2>
            {selectedCorridorSlug === null ? (
              <div
                role={corridorsError ? "alert" : "status"}
                data-testid="freshness-breakdown-no-corridors"
                className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]"
              >
                {corridorsError
                  ? `Unable to load reviewed corridors: ${corridorsError}`
                  : "No reviewed corridors are currently persisted."}
              </div>
            ) : (
              <CurrentFreshnessBreakdownView
                corridors={corridors}
                selectedCorridorSlug={selectedCorridorSlug}
                initialRates={initialRates}
                initialError={initialError}
              />
            )}
          </section>
        </div>
      </main>
    </>
  );
}
