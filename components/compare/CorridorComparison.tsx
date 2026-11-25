import Link from "next/link";
import type { PublicCorridor } from "@/types/api/corridors";
function CorridorFacts({ corridor }: { corridor: PublicCorridor }) {
  return (
    <article className="rounded-lg border border-[var(--ghost)] p-4">
      <h3 className="text-lg font-medium text-[var(--white)]">
        <Link href={`/corridors/${corridor.slug}`}
          className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
          {corridor.sourceAsset} ({corridor.sourceCountry}) → {corridor.destinationAsset} ({corridor.destinationCountry})
        </Link>
      </h3>
      <dl className="mt-4 grid gap-3 text-sm">
        <div><dt className="text-[var(--muted)]">Source asset</dt><dd>{corridor.sourceAsset}</dd></div>
        <div><dt className="text-[var(--muted)]">Source country</dt><dd>{corridor.sourceCountry}</dd></div>
        <div><dt className="text-[var(--muted)]">Destination asset</dt><dd>{corridor.destinationAsset}</dd></div>
        <div><dt className="text-[var(--muted)]">Destination country</dt><dd>{corridor.destinationCountry}</dd></div>
        <div><dt className="text-[var(--muted)]">Associated anchors</dt><dd>{corridor.anchorCount}</dd></div>
      </dl>
    </article>
  );
}

/** Testable read-only comparison. No network rates or executable quotes. */
export function CorridorComparison({ first, second }: { first: PublicCorridor; second: PublicCorridor }) {
  return (
    <section id="comparison-result" aria-labelledby="corridor-comparison-heading"
      className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6">
      <h2 id="corridor-comparison-heading" className="mb-5 text-lg text-[var(--white)]">
        Comparison: {first.slug} vs {second.slug}
      </h2>
      <div className="grid gap-5 md:grid-cols-2">
        <CorridorFacts corridor={first} />
        <CorridorFacts corridor={second} />
      </div>
      <p className="mt-5 border-t border-[var(--ghost)] pt-4 text-sm text-[var(--muted)]">
        Reviewed corridor configuration only. No price, rate, liquidity, or operational claims.
        Associated anchor counts do not prove current transfer availability.
      </p>
    </section>
  );
}

