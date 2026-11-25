import Link from "next/link";
import type { PublicAnchorSummary, PublicAnchorStatus } from "@/types/api/anchors";
function syncLabel(status: PublicAnchorStatus): string {
  switch (status) {
    case "LIVE": return "Last sync successful";
    case "DEGRADED": return "Last sync degraded";
    case "DOWN": return "Last sync failed";
    case "UNKNOWN": return "Last sync unknown";
  }
}

function AnchorFacts({ anchor }: { anchor: PublicAnchorSummary }) {
  return (
    <article className="rounded-lg border border-[var(--ghost)] p-4">
      <h3 className="text-lg font-medium text-[var(--white)]">
        <Link className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={`/anchors/${anchor.slug}`}>
          {anchor.name}
        </Link>
      </h3>
      <dl className="mt-4 grid gap-3 text-sm">
        <div><dt className="text-[var(--muted)]">Home domain</dt><dd className="break-all">{anchor.homeDomain}</dd></div>
        <div><dt className="text-[var(--muted)]">Synchronization status</dt><dd>{syncLabel(anchor.status)}</dd></div>
        <div><dt className="text-[var(--muted)]">Advertised SEPs</dt><dd>{anchor.seps.length ? anchor.seps.map((sep) => `SEP-${sep}`).join(", ") : "None advertised"}</dd></div>
        <div><dt className="text-[var(--muted)]">Transfer interface</dt><dd>{anchor.isTransferCapable ? "Transfer interface advertised" : "No transfer interface advertised"}</dd></div>
        <div><dt className="text-[var(--muted)]">Reviewed corridor count</dt><dd>{anchor.corridorCount}</dd></div>
      </dl>
    </article>
  );
}

/** Testable pure view: only existing, persisted public anchor summaries are compared. */
export function AnchorComparison({ first, second }: { first: PublicAnchorSummary; second: PublicAnchorSummary }) {
  return (
    <section id="comparison-result" aria-labelledby="anchor-comparison-heading" className="mt-8 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-6">
      <h2 id="anchor-comparison-heading" className="mb-5 text-lg text-[var(--white)]">
        Comparison: {first.name} vs {second.name}
      </h2>
      <div className="grid gap-5 md:grid-cols-2">
        <AnchorFacts anchor={first} />
        <AnchorFacts anchor={second} />
      </div>
      <p className="mt-5 border-t border-[var(--ghost)] pt-4 text-sm text-[var(--muted)]">
        Configuration data from persisted public evidence. No price, rate, liquidity, or operational claims.
        Synchronization reflects the last recorded result, not live availability.
      </p>
    </section>
  );
}

