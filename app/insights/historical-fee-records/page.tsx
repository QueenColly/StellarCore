import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";
import { HISTORICAL_FEE_WINDOWS } from "@/lib/rates/historicalFeeRecords";
import { HistoricalFeeRecordsView } from "./HistoricalFeeRecordsView";

type Props = Readonly<{
  searchParams?: Promise<Readonly<{ corridor?: string; days?: string; anchor?: string }>>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Historical Fee Records — StellarCore",
  description:
    "Read-only inspection of fee strings recorded in a corridor's historical rate snapshots, grouped by anchor and exact source amount.",
};

const DEFAULT_DAYS = 30;

function resolveDays(value: string | undefined): number {
  const parsed = Number(value);
  return HISTORICAL_FEE_WINDOWS.some((window) => window.days === parsed) ? parsed : DEFAULT_DAYS;
}

function resolveAnchor(value: string | undefined): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/i.test(value) ? value : null;
}

export default async function HistoricalFeeRecordsPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const corridorsResult = await getCorridorsApiResult();
  const corridors = corridorsResult.status === 200 ? corridorsResult.body.corridors : [];
  const corridorsError =
    corridorsResult.status === 200 ? null : corridorsResult.body.error.message;

  const selectedCorridorSlug =
    resolvedParams.corridor && corridors.some((c) => c.slug === resolvedParams.corridor)
      ? resolvedParams.corridor
      : (corridors[0]?.slug ?? null);
  const days = resolveDays(resolvedParams.days);

  const historyResult = selectedCorridorSlug
    ? await getRateHistoryApiResult(selectedCorridorSlug, String(days))
    : null;

  const initialHistory = historyResult?.status === 200 ? historyResult.body : null;
  const initialError =
    historyResult && historyResult.status !== 200 ? historyResult.body.error.message : null;

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
            <span aria-current="page">Historical Fee Records</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Historical Evidence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Recorded fee values
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Shows the fee string each anchor reported in the stored rate-history snapshots for a
              reviewed corridor, exactly as recorded. Fees are grouped only within the same anchor
              and the exact same source amount. They are not normalized, converted, ranked, or
              compared across anchors or amounts.
            </p>
          </header>

          <section aria-labelledby="fee-records-heading" className="mt-8">
            <h2 id="fee-records-heading" className="sr-only">
              Historical fee records
            </h2>
            {selectedCorridorSlug === null ? (
              <div
                role={corridorsError ? "alert" : "status"}
                data-testid="fee-records-no-corridors"
                className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]"
              >
                {corridorsError
                  ? `Unable to load reviewed corridors: ${corridorsError}`
                  : "No reviewed corridors are currently configured."}
              </div>
            ) : (
              <HistoricalFeeRecordsView
                corridors={corridors}
                selectedCorridorSlug={selectedCorridorSlug}
                initialDays={days}
                initialAnchorSlug={resolveAnchor(resolvedParams.anchor)}
                initialHistory={initialHistory}
                initialError={initialError}
              />
            )}
          </section>
        </div>
      </main>
    </>
  );
}
