import type { Metadata } from "next";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { MIN_REPUTATION_OUTCOMES, REPUTATION_OUTCOME_WINDOW_DAYS } from "@/constants/reputation";
import { ReadinessClient } from "./ReadinessClient";

export const metadata: Metadata = {
  title: "Reputation readiness — StellarCore",
  description:
    "What evidence each anchor is missing before a reputation score can be published. Null scores stay unavailable.",
};

export default function ReputationReadinessPage() {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl">
            <p className="eyebrow">Reputation</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              Reputation evidence readiness
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              StellarCore computes reputation deterministically, but only from recorded evidence. When evidence is missing,
              the score stays unavailable. Nothing on this page is simulated, estimated, or inferred.
            </p>
          </header>

          <section
            aria-labelledby="threshold-heading"
            className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
          >
            <h2 id="threshold-heading" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              What a published score requires
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--white)]" data-testid="readiness-threshold">
              At least {MIN_REPUTATION_OUTCOMES} recorded transfer outcomes within the {REPUTATION_OUTCOME_WINDOW_DAYS}-day
              evaluation window. This minimum is necessary but not sufficient.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              <li>The anchor must have at least one associated reviewed corridor.</li>
              <li>At least one latest rate observation must exist in the evaluated evidence.</li>
              <li>The evidence must be read and evaluated successfully by the reputation engine.</li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              Production does not yet have a trusted transfer-outcome ingestion source, so most anchors are expected to show
              not evaluated or insufficient evidence.
            </p>
          </section>

          <ReadinessClient minimumOutcomes={MIN_REPUTATION_OUTCOMES} />
        </div>
      </main>
    </>
  );
}
