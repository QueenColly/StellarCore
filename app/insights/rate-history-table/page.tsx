import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";
import { RateHistoryTableView } from "./RateHistoryTableView";

type Props = Readonly<{
  searchParams?: Promise<Readonly<{ corridor?: string; days?: string }>>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rate History Table — StellarCore",
  description: "Accessible tabular view of persisted rate observations across reviewed corridors.",
};

export default async function RateHistoryTablePage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const corridorsResult = await getCorridorsApiResult();
  const corridors = corridorsResult.status === 200 ? corridorsResult.body.corridors : [];

  const defaultSlug = corridors[0]?.slug ?? "usdc-us-brl-br";
  const selectedCorridorSlug = resolvedParams.corridor && corridors.some((c) => c.slug === resolvedParams.corridor)
    ? resolvedParams.corridor
    : defaultSlug;

  const historyResult = await getRateHistoryApiResult(selectedCorridorSlug, resolvedParams.days);

  const initialHistory = historyResult.status === 200 ? historyResult.body : null;
  const initialError = historyResult.status !== 200 ? historyResult.body.error.message : null;

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
            <span aria-current="page">Rate History Table</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Historical Analytics</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Rate Observation History
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Accessible tabular view of persisted rate observations, evidence source counts, and median states across reviewed corridors.
            </p>
          </header>

          <section aria-labelledby="history-table-heading" className="mt-8">
            <h2 id="history-table-heading" className="sr-only">
              Historical Rate Observations Table
            </h2>
            <RateHistoryTableView
              corridors={corridors}
              initialHistory={initialHistory}
              selectedCorridorSlug={selectedCorridorSlug}
              initialError={initialError}
            />
          </section>
        </div>
      </main>
    </>
  );
}
