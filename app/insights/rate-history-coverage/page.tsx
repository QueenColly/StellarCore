import type { Metadata } from "next";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { RateHistoryCoverageClient } from "./RateHistoryCoverageClient";

export const metadata: Metadata = {
  title: "Rate-history coverage — StellarCore",
  description:
    "Honest overview of persisted observation points and chronological evidence gaps across supported historical rate windows without inventing uptime.",
};

export default function RateHistoryCoveragePage() {
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
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Rate-history coverage
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Historical rate analysis requires distinguishing periods with recorded evidence
              from periods where no observations were stored. This view summarizes distinct
              observed UTC calendar dates and chronological intervals between returned points.
              Missing observations are reported transparently as absence of stored records rather
              than assumed endpoint failures or artificial uptime percentages.
            </p>
          </header>

          <RateHistoryCoverageClient />
        </div>
      </main>
    </>
  );
}
