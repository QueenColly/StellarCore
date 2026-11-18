import { Suspense } from "react";
import type { Metadata } from "next";
import { AnchorsSection } from "@/components/dashboard/AnchorsSection";
import { CorridorsSection } from "@/components/dashboard/CorridorsSection";
import { RatePanel } from "@/components/dashboard/RatePanel";
import { ReputationSection } from "@/components/dashboard/ReputationSection";
import { SectionSkeleton } from "@/components/dashboard/SectionStates";
import { EvidenceLegend } from "@/components/ui/EvidenceLegend";
import { ProductHeader } from "@/components/ui/ProductHeader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — StellarCore",
  description: "Read-only view of persisted Stellar anchors, corridors, rate evidence, and reputation.",
};

export default function DashboardPage() {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl">
            <p className="eyebrow">Public evidence console</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              Persisted signals, clearly separated.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              Inspect synchronized anchor metadata, reviewed corridors, stored USDC → BRL rate observations,
              and reputation evaluations. Configuration is not an observation, advertised interfaces are not
              current availability, and insufficient evidence remains visible.
            </p>
          </header>

          <EvidenceLegend />

          <section className="mt-9" aria-labelledby="anchors-heading">
            <h2 id="anchors-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Anchors
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--muted)]">
              Status describes persisted synchronization state. Advertised interfaces reflect the last successful
              SEP-1 synchronization, not current operation or availability.
            </p>
            <div className="mt-4">
              <Suspense fallback={<SectionSkeleton label="anchors" />}>
                <AnchorsSection />
              </Suspense>
            </div>
          </section>

          <section className="mt-14" aria-labelledby="corridors-heading">
            <h2 id="corridors-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Corridors
            </h2>
            <div className="mt-4">
              <Suspense fallback={<SectionSkeleton label="corridors" />}>
                <CorridorsSection />
              </Suspense>
            </div>
          </section>

          <section className="mt-14" aria-labelledby="rates-heading">
            <h2 id="rates-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              USDC → BRL rate
            </h2>
            <div className="mt-4">
              <Suspense fallback={<SectionSkeleton label="rates" />}>
                <RatePanel />
              </Suspense>
            </div>
          </section>

          <section className="mt-14" aria-labelledby="reputation-heading">
            <h2 id="reputation-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Reputation
            </h2>
            <div className="mt-4">
              <Suspense fallback={<SectionSkeleton label="reputation" />}>
                <ReputationSection />
              </Suspense>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
