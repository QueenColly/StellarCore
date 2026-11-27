import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getReputationApiResult } from "@/lib/api/reputation";
import { ReputationStateDistributionView } from "./ReputationStateDistributionView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reputation State Distribution — StellarCore",
  description:
    "Read-only counts of returned anchor reputation records by published band and unpublished state.",
};

export default async function ReputationStateDistributionPage() {
  const result = await getReputationApiResult();
  const response = result.status === 200 ? result.body : null;
  const error = result.status === 200 ? null : result.body.error.message;

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
            <span aria-current="page">Reputation State Distribution</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Reputation Intelligence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Reputation state distribution
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Counts the anchor reputation records returned by the public reputation list. Published
              green, amber, and red bands are summarized separately from anchors with insufficient
              evidence or no evaluation yet. An unpublished reputation is not a low rating. See the{" "}
              <Link
                href="/learn/reputation-methodology"
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                reputation methodology
              </Link>
              .
            </p>
          </header>

          <section aria-labelledby="reputation-distribution-heading" className="mt-8">
            <h2 id="reputation-distribution-heading" className="sr-only">
              Reputation state distribution
            </h2>
            <ReputationStateDistributionView response={response} error={error} />
          </section>
        </div>
      </main>
    </>
  );
}
