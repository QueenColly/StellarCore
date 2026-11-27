import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRatesApiResult } from "@/lib/api/rates";
import { RateObservationBreakdownView } from "./RateObservationBreakdownView";
import { selectReviewedCorridorSlug, type BreakdownSearchParams } from "./selection";

type Props = Readonly<{
  searchParams?: Promise<BreakdownSearchParams>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rate observation breakdown — StellarCore",
  description:
    "Inspect source amounts, destination amounts, and reported fees from persisted indicative rate observations by reviewed corridor.",
};

function PageShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted)]">
            <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
              Dashboard
            </Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span aria-current="page">Rate observation breakdown</span>
          </nav>
          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Indicative rate evidence</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              Rate observation breakdown
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Inspect the amounts and raw fees recorded for each anchor observation in a reviewed corridor. These are
              persisted indicative SEP-38 data, not executable prices, live offers, or firm quotes. Recorded amounts
              are evidence only, never a transfer instruction.
            </p>
          </header>
          {children}
        </div>
      </main>
    </>
  );
}

export default async function RateObservationBreakdownPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const corridorsResult = await getCorridorsApiResult();

  if (corridorsResult.status !== 200) {
    return (
      <PageShell>
        <div
          role="alert"
          data-evidence-state="unavailable"
          data-breakdown-state="corridors-unavailable"
          className="mt-8 rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            Unavailable<span className="sr-only">: </span>
          </p>
          <p className="mt-2">Unable to load reviewed corridors: {corridorsResult.body.error.message}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            No corridor was selected and no observations are inferred.
          </p>
        </div>
      </PageShell>
    );
  }

  const corridors = corridorsResult.body.corridors;
  const selectedCorridorSlug = selectReviewedCorridorSlug(params, corridors);
  const ratesResult = selectedCorridorSlug ? await getRatesApiResult(selectedCorridorSlug) : null;

  return (
    <PageShell>
      <section aria-label="Observation evidence" aria-live="polite" className="mt-8">
        <RateObservationBreakdownView
          corridors={corridors}
          selectedCorridorSlug={selectedCorridorSlug}
          ratesResult={ratesResult}
        />
      </section>
    </PageShell>
  );
}
