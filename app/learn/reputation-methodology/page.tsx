import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/ProductHeader";
import {
  MIN_REPUTATION_OUTCOMES,
  REPUTATION_BANDS,
  REPUTATION_METRICS_WINDOW_DAYS,
  REPUTATION_OUTCOME_WINDOW_DAYS,
  REPUTATION_WEIGHTS,
} from "@/constants/reputation";

export const metadata: Metadata = {
  title: "Reputation methodology — StellarCore",
  description:
    "Read-only explanation of StellarCore reputation weights, eligibility, score bands, and evidence limits.",
};

const WEIGHT_ITEMS = [
  {
    key: "availability",
    label: "Availability",
    weight: REPUTATION_WEIGHTS.availability,
    description: "Anchor sync/availability signal derived from persisted status.",
  },
  {
    key: "rateFreshness",
    label: "Rate freshness",
    weight: REPUTATION_WEIGHTS.rateFreshness,
    description: "Share of latest corridor rates that are fresh at evaluation time.",
  },
  {
    key: "coverage",
    label: "Coverage",
    weight: REPUTATION_WEIGHTS.coverage,
    description: "Share of served corridors with fresh latest rate evidence.",
  },
  {
    key: "transferReliability",
    label: "Transfer reliability",
    weight: REPUTATION_WEIGHTS.transferReliability,
    description: "Completed transfer outcomes over relevant outcomes in the evidence window.",
  },
] as const;

const totalWeight = WEIGHT_ITEMS.reduce((sum, item) => sum + item.weight, 0);

export default function ReputationMethodologyPage() {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-4xl">
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted)]">
            <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">Dashboard</Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span aria-current="page">Reputation methodology</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Learn</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              Reputation methodology
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
              This page explains how StellarCore calculates established reputation scores and why a score can be
              unpublished when trusted evidence is insufficient. It is read-only educational content; it does not
              predict or simulate any individual anchor score.
            </p>
          </header>

          <section aria-labelledby="weights-heading" className="mt-10">
            <p className="eyebrow">Scoring components</p>
            <h2 id="weights-heading" className="mt-2 text-xl" style={{ fontFamily: "var(--display)" }}>
              Current weights ({totalWeight} total)
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Established scores combine four components. Values below are derived from the committed reputation constants.
            </p>
            <div className="mt-5 overflow-x-auto rounded-lg border border-[var(--ghost)]">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <caption className="sr-only">Reputation scoring components and weights</caption>
                <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Component</th>
                    <th scope="col" className="px-4 py-3">Weight</th>
                    <th scope="col" className="px-4 py-3">What it measures</th>
                  </tr>
                </thead>
                <tbody>
                  {WEIGHT_ITEMS.map((item) => (
                    <tr key={item.key} className="border-t border-[var(--ghost)]">
                      <th scope="row" className="px-4 py-3 font-medium text-[var(--white)]">{item.label}</th>
                      <td className="px-4 py-3 text-[var(--white)]">{item.weight}</td>
                      <td className="px-4 py-3 text-[var(--muted)]">{item.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol className="mt-4 space-y-2 text-sm text-[var(--muted)]" aria-label="Weight summary">
              {WEIGHT_ITEMS.map((item) => (
                <li key={item.key}>
                  <span className="text-[var(--white)]">{item.label}</span>: {item.weight} points
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="eligibility-heading" className="mt-10">
            <p className="eyebrow">Eligibility</p>
            <h2 id="eligibility-heading" className="mt-2 text-xl" style={{ fontFamily: "var(--display)" }}>
              When a score is published
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              A score is established only when all eligibility criteria are met. Outcomes are evaluated in a rolling
              {" "}{REPUTATION_OUTCOME_WINDOW_DAYS}-day window; settlement and slippage metrics use a separate
              {" "}{REPUTATION_METRICS_WINDOW_DAYS}-day window.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--muted)]">
              <li>At least <span className="text-[var(--white)]">{MIN_REPUTATION_OUTCOMES} relevant outcomes</span> in the last {REPUTATION_OUTCOME_WINDOW_DAYS} days.</li>
              <li>At least <span className="text-[var(--white)]">one served corridor</span>.</li>
              <li>At least <span className="text-[var(--white)]">one latest rate observation</span>.</li>
            </ul>
            <div className="mt-5 rounded-lg border border-[rgba(243,184,100,0.35)] bg-[rgba(243,184,100,0.08)] p-4" role="status" aria-label="Insufficient evidence example">
              <p className="text-sm font-medium text-[#f3b864]">Not enough verified outcomes</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                When eligibility is not met, StellarCore does not publish a numeric reputation score. The API and UI
                represent this as insufficient evidence or not evaluated, with a null score.
              </p>
            </div>
          </section>

          <section aria-labelledby="bands-heading" className="mt-10">
            <p className="eyebrow">Score bands</p>
            <h2 id="bands-heading" className="mt-2 text-xl" style={{ fontFamily: "var(--display)" }}>
              Band thresholds
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Bands apply only to established scores. They are not predictions and do not replace underlying evidence.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Green</dt>
                <dd className="mt-1 text-sm text-[var(--white)]">Score &gt;= {REPUTATION_BANDS.greenMinimum}</dd>
              </div>
              <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Amber</dt>
                <dd className="mt-1 text-sm text-[var(--white)]">Score &gt;= {REPUTATION_BANDS.amberMinimum} and &lt; {REPUTATION_BANDS.greenMinimum}</dd>
              </div>
              <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Red</dt>
                <dd className="mt-1 text-sm text-[var(--white)]">Score &lt; {REPUTATION_BANDS.amberMinimum}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="limits-heading" className="mt-10 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5">
            <h2 id="limits-heading" className="text-lg" style={{ fontFamily: "var(--display)" }}>
              Evidence limits
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              The reputation engine existing in code does not mean trusted real-world outcome ingestion is operational.
              This page does not show live scores, fabricate production outcomes, or infer an anchor&apos;s readiness.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link href="/docs/reputation-methodology.md" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
                Technical methodology (docs)
              </Link>
              <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
                Back to dashboard
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
