import type { Metadata } from "next";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRatesApiResult } from "@/lib/api/rates";
import { loadCorridorEvidenceCoverage, parseBatchParam } from "./coverage";
import { CorridorCoverageView } from "./CorridorCoverageView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corridor evidence coverage — StellarCore",
  description:
    "Compare which reviewed corridors have stored indicative rate observations, fresh independent observations and a publishable median.",
};

type Props = Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>;

export default async function CorridorEvidenceCoveragePage({ searchParams }: Props) {
  const { batch } = await searchParams;
  const report = await loadCorridorEvidenceCoverage(
    {
      readCorridors: () => getCorridorsApiResult(),
      readRates: (slug) => getRatesApiResult(slug),
    },
    parseBatchParam(batch),
  );

  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl">
            <p className="eyebrow">Corridor intelligence</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              Corridor evidence coverage
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Compare which reviewed corridors currently have stored indicative rate observations, how many are fresh
              and independent, and whether a median can be published. Values come only from the read-only corridor and
              rate APIs.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Registry membership is configuration, not operational coverage. No corridor here represents a verified,
              available transfer route, and nothing on this page measures live uptime.
            </p>
          </header>

          <dl className="mt-6 grid max-w-4xl gap-3 text-xs text-[var(--muted)] sm:grid-cols-2">
            <div>
              <dt className="font-semibold uppercase tracking-wide text-[var(--white)]">Configured only</dt>
              <dd className="mt-1">Reviewed candidates exist, but no rate observation is stored.</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-[var(--white)]">Stored, insufficient fresh sources</dt>
              <dd className="mt-1">Observations are stored, but too few are fresh and independent; no median is published.</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-[var(--white)]">Eligible median</dt>
              <dd className="mt-1">Enough fresh independent observations exist and an indicative median is published.</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-[var(--white)]">Rate API unavailable</dt>
              <dd className="mt-1">The rate read failed for that corridor; this does not mean evidence is absent.</dd>
            </div>
          </dl>

          <section className="mt-8" aria-label="Coverage by corridor">
            <CorridorCoverageView report={report} />
          </section>
        </div>
      </main>
    </>
  );
}
