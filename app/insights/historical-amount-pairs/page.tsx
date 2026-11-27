import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";
import { HISTORICAL_AMOUNT_PAIR_WINDOWS } from "@/lib/rates/historicalAmountPairs";
import { HistoricalAmountPairsView } from "./HistoricalAmountPairsView";

type Props = Readonly<{
  searchParams?: Promise<Readonly<{ corridor?: string; days?: string }>>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Historical Amount Pairs — StellarCore",
  description:
    "Read-only grouping of the exact source and destination amount strings persisted in public rate-history observations.",
};

const DEFAULT_DAYS = 30;

function resolveDays(value: string | undefined): number {
  const parsed = Number(value);
  return HISTORICAL_AMOUNT_PAIR_WINDOWS.some((window) => window.days === parsed)
    ? parsed
    : DEFAULT_DAYS;
}

export default async function HistoricalAmountPairsPage({ searchParams }: Props) {
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
            <span aria-hidden="true" className="px-2">
              /
            </span>
            <span aria-current="page">Historical Amount Pairs</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Historical Analytics</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Persisted amount pairs
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Groups persisted anchor observations by their exact source and destination amount
              strings, for one reviewed corridor at a time. Amount strings are shown exactly as
              returned: no currency conversion, no rate derived from the amounts, and no claim that
              any pair was executable.
            </p>
          </header>

          <section aria-labelledby="historical-amount-pairs-heading" className="mt-8">
            <h2 id="historical-amount-pairs-heading" className="sr-only">
              Historical nominal amount pairs
            </h2>
            {selectedCorridorSlug === null ? (
              <div
                role={corridorsError ? "alert" : "status"}
                data-testid="historical-amount-pairs-no-corridors"
                className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]"
              >
                {corridorsError
                  ? `Unable to load reviewed corridors: ${corridorsError}`
                  : "No reviewed corridors are currently persisted."}
              </div>
            ) : (
              <HistoricalAmountPairsView
                corridors={corridors}
                selectedCorridorSlug={selectedCorridorSlug}
                initialDays={days}
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
