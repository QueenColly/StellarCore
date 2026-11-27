import type { Metadata } from "next";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { CoverageClient } from "./CoverageClient";

export const metadata: Metadata = {
  title: "Rate-source coverage — StellarCore",
  description:
    "Why a corridor median is or is not published: reviewed candidates, persisted observations, fresh independent sources, and the required minimum.",
};

export default function RateSourceCoveragePage() {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl">
            <p className="eyebrow">Rate intelligence</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              Rate-source coverage
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              A median is published only when enough fresh, independent observations exist. This page separates what is
              configured (reviewed candidates) from what was observed (latest persisted observations) and what currently
              qualifies (fresh independent observations), so you can see exactly why a median is or is not available.
            </p>
          </header>

          <CoverageClient />
        </div>
      </main>
    </>
  );
}
