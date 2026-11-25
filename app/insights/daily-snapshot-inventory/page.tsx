import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";
import { DailySnapshotInventoryView } from "./DailySnapshotInventoryView";
import {
  resolveInventoryWindowDays,
  selectReviewedCorridorSlug,
  type InventorySearchParams,
} from "./selection";

type Props = Readonly<{
  searchParams?: Promise<InventorySearchParams>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Daily snapshot inventory — StellarCore",
  description:
    "Read-only inventory of returned rate-history snapshot records and recorded observations per UTC calendar day for one reviewed corridor. A day without returned snapshots is not described as downtime.",
};

function PageShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <ProductHeader current="dashboard" />
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
            <span aria-current="page">Daily snapshot inventory</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Persisted history evidence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Daily snapshot inventory
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Counts the persisted snapshot records and recorded observations that the public
              rate-history response actually returned for one reviewed corridor, grouped by UTC
              calendar day. A day with no returned snapshots is labelled as absent evidence, never
              as downtime. No median, rate, uptime, operating hours, missing-source claim or
              interpolation is derived.
            </p>
          </header>

          {children}
        </div>
      </main>
    </>
  );
}

export default async function DailySnapshotInventoryPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const corridorsResult = await getCorridorsApiResult();

  if (corridorsResult.status !== 200) {
    return (
      <PageShell>
        <section aria-label="Daily snapshot inventory" className="mt-8">
          <div
            role="alert"
            data-evidence-state="unavailable"
            data-inventory-state="corridors-unavailable"
            className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Unavailable<span className="sr-only">: </span>
            </p>
            <p className="mt-2">
              Unable to load reviewed corridors: {corridorsResult.body.error.message}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              No corridor was selected and no snapshot or observation count is inferred.
            </p>
          </div>
        </section>
      </PageShell>
    );
  }

  const corridors = corridorsResult.body.corridors;
  const selectedCorridorSlug = selectReviewedCorridorSlug(params, corridors);
  const days = resolveInventoryWindowDays(params.days);

  if (corridors.length === 0) {
    return (
      <PageShell>
        <section aria-label="Daily snapshot inventory" className="mt-8">
          <div
            data-testid="daily-snapshot-inventory-no-corridors"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]"
          >
            No reviewed corridors are currently persisted, so there is no corridor whose daily
            snapshot inventory could be read.
          </div>
        </section>
      </PageShell>
    );
  }

  const historyResult = await getRateHistoryApiResult(selectedCorridorSlug, String(days));
  const initialHistory = historyResult.status === 200 ? historyResult.body : null;
  const initialError =
    historyResult.status === 200 ? null : historyResult.body.error.message;
  const initialDegraded =
    historyResult.status === 200 ? historyResult.degraded : undefined;

  return (
    <PageShell>
      <section aria-label="Daily snapshot inventory" aria-live="polite" className="mt-8">
        <DailySnapshotInventoryView
          corridors={corridors}
          selectedCorridorSlug={selectedCorridorSlug}
          initialDays={days}
          initialHistory={initialHistory}
          initialError={initialError}
          initialDegraded={initialDegraded}
        />
      </section>
    </PageShell>
  );
}
