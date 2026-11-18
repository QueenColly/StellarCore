import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SEPS } from "@/constants/seps";
import { getAnchorApiResult } from "@/lib/api/anchors";
import { getAnchorReputationApiResult } from "@/lib/api/reputation";
import { advertisedCapabilities } from "@/lib/stellar/advertisedCapabilities";
import { ProductHeader } from "@/components/ui/ProductHeader";
import type { PublicAnchorStatus } from "@/types/api/anchors";
import type {
  PublicReputation,
  PublicReputationScoreBand,
  PublicReputationState,
} from "@/types/api/reputation";

type Props = Readonly<{ params: Promise<Readonly<{ slug: string }>> }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getAnchorApiResult(slug);
  if (result.status !== 200) return { title: "Anchor not found — StellarCore" };

  const { anchor } = result.body;
  return {
    title: `${anchor.name} — StellarCore`,
    description: `Read-only anchor detail for ${anchor.name} (${anchor.homeDomain}).`,
  };
}

export default async function AnchorPage({ params }: Props) {
  const { slug } = await params;
  const anchorResult = await getAnchorApiResult(slug);
  if (anchorResult.status === 404 || anchorResult.status === 400) notFound();
  if (anchorResult.status !== 200) {
    return <ErrorState message={anchorResult.body.error.message} />;
  }

  const { anchor } = anchorResult.body;
  const sync = syncPresentation(anchor.status);
  const capabilities = advertisedCapabilities(anchor.seps);
  const hasSep38 = anchor.seps.includes(SEPS.SEP_38);

  const reputationResult = await getAnchorReputationApiResult(slug);
  const reputation = reputationResult.status === 200
    ? reputationResult.body.reputation
    : null;

  return (
    <>
      <ProductHeader current="dashboard" />
      <main id="main-content" className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted)]">
            <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">Dashboard</Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span aria-current="page">{anchor.slug}</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Anchor detail</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              {anchor.name}
            </h1>
            <p className="mt-3 font-mono text-sm text-[var(--muted)]">{anchor.homeDomain}</p>
            <div className="mt-4">
              <Badge tone={sync.tone} label={sync.label} />
            </div>
          </header>

          <section aria-labelledby="synchronization-heading" className="mt-10">
            <p className="eyebrow">Synchronization</p>
            <h2 id="synchronization-heading" className="mt-2 text-xl" style={{ fontFamily: "var(--display)" }}>
              Persisted sync state
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Status describes the last persisted synchronization result. Advertised interfaces reflect the last
              successful SEP-1 synchronization, not current operation or availability.
            </p>
          </section>

          <section aria-labelledby="seps-heading" className="mt-10">
            <p className="eyebrow">Advertised SEPs</p>
            <h2 id="seps-heading" className="mt-2 text-xl" style={{ fontFamily: "var(--display)" }}>
              Advertised interfaces
            </h2>
            {anchor.seps.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                No approved SEP capabilities are advertised for this anchor.
              </p>
            ) : (
              <div className="mt-5 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--white)]">
                      {anchor.seps.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      SEP numbers observed during the last successful SEP-1 sync.
                    </p>
                  </div>
                  <Badge tone="neutral" label={anchor.isTransferCapable
                    ? "Transfer interface advertised"
                    : "No transfer interface advertised"} />
                </div>
                {capabilities.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 text-xs text-[var(--muted)]">
                    {capabilities.map((capability) => (
                      <li key={capability.sep}>{capability.label}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    No approved SEP capability label is available.
                  </p>
                )}
                {hasSep38 ? (
                  <p className="mt-3 text-[10px] leading-relaxed text-[var(--muted)]">
                    SEP-38 advertisement does not establish a reviewed indicative-rate source, current freshness,
                    or a firm quote.
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <section aria-labelledby="corridors-heading" className="mt-10">
            <p className="eyebrow">Associated corridors</p>
            <h2 id="corridors-heading" className="mt-2 text-xl" style={{ fontFamily: "var(--display)" }}>
              {anchor.corridors.length} {anchor.corridors.length === 1 ? "corridor" : "corridors"}
            </h2>
            {anchor.corridors.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No corridors are currently associated with this anchor.</p>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {anchor.corridors.map((corridor) => (
                  <Link
                    key={corridor.slug}
                    href={`/corridors/${corridor.slug}`}
                    className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                  >
                    <h3 className="text-lg text-[var(--white)]" style={{ fontFamily: "var(--display)" }}>
                      {corridor.sourceAsset} → {corridor.destinationAsset}
                    </h3>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {corridor.sourceCountry} to {corridor.destinationCountry}
                    </p>
                    <p className="mt-3 font-mono text-[10px] text-[var(--muted)]">{corridor.slug}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="reputation-heading" className="mt-10">
            <p className="eyebrow">Reputation evidence</p>
            <h2 id="reputation-heading" className="mt-2 text-xl" style={{ fontFamily: "var(--display)" }}>
              Evaluated outcome history
            </h2>
            {reputation === null ? (
              <div className="mt-5 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5">
                <p className="text-sm text-[var(--muted)]">
                  Reputation evidence is currently unavailable for this anchor.
                </p>
              </div>
            ) : (
              <ReputationEvidence reputation={reputation} />
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function ReputationEvidence({ reputation }: { reputation: PublicReputation }) {
  return (
    <div className="mt-5 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg text-[var(--white)]" style={{ fontFamily: "var(--display)" }}>
          {reputation.anchor.name}
        </h3>
        <Badge tone={stateTone(reputation.state)} label={stateCopy(reputation.state)} />
      </div>

      {reputation.state === "established" && reputation.score !== null ? (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl text-[var(--white)]" style={{ fontFamily: "var(--display)" }}>
            {reputation.score}
          </span>
          <span className="text-xs text-[var(--muted)]">/100</span>
          {reputation.scoreBand ? (
            <Badge tone={bandTone(reputation.scoreBand)} label={reputation.scoreBand} />
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--muted)]">
          {reputation.state === "not_evaluated"
            ? "This anchor has no persisted evaluation yet."
            : "Evidence is too sparse for a published score."}
        </p>
      )}

      {reputation.evidence ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Outcomes evaluated: <span className="text-[var(--white)]">{reputation.evidence.outcomeCount}</span>
        </p>
      ) : null}

      {reputation.metrics ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
          <div>
            <dt>Fill rate 7d</dt>
            <dd className="text-[var(--white)]">{formatMetric(reputation.metrics.fillRate7d)}</dd>
          </div>
          <div>
            <dt>Fill rate 30d</dt>
            <dd className="text-[var(--white)]">{formatMetric(reputation.metrics.fillRate30d)}</dd>
          </div>
          <div>
            <dt>Fill rate 90d</dt>
            <dd className="text-[var(--white)]">{formatMetric(reputation.metrics.fillRate90d)}</dd>
          </div>
          <div>
            <dt>Settlement p50</dt>
            <dd className="text-[var(--white)]">{formatMs(reputation.metrics.settleP50Ms)}</dd>
          </div>
          <div>
            <dt>Settlement p95</dt>
            <dd className="text-[var(--white)]">{formatMs(reputation.metrics.settleP95Ms)}</dd>
          </div>
          <div>
            <dt>Slippage p50</dt>
            <dd className="text-[var(--white)]">{formatMetric(reputation.metrics.slippageP50)}</dd>
          </div>
        </dl>
      ) : null}

      {reputation.computedAt ? (
        <p className="mt-3 text-[10px] uppercase tracking-wide text-[var(--muted)]">
          Computed {new Date(reputation.computedAt).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}

function syncPresentation(status: PublicAnchorStatus) {
  switch (status) {
    case "LIVE":
      return { tone: "positive" as const, label: "Synced" };
    case "DEGRADED":
      return { tone: "warning" as const, label: "Sync degraded" };
    case "DOWN":
      return { tone: "negative" as const, label: "Sync failed" };
    case "UNKNOWN":
      return { tone: "neutral" as const, label: "Sync unknown" };
  }
}

function stateCopy(state: PublicReputationState): string {
  switch (state) {
    case "established":
      return "Established";
    case "insufficient_evidence":
      return "Insufficient evidence";
    case "not_evaluated":
      return "Not yet evaluated";
  }
}

function stateTone(state: PublicReputationState) {
  return state === "established" ? ("positive" as const) : ("neutral" as const);
}

function bandTone(band: PublicReputationScoreBand) {
  switch (band) {
    case "green":
      return "positive" as const;
    case "amber":
      return "warning" as const;
    case "red":
      return "negative" as const;
  }
}

function formatMetric(value: number | null): string {
  return value === null ? "—" : String(value);
}

function formatMs(value: number | null): string {
  return value === null ? "—" : `${value} ms`;
}

type BadgeTone = "positive" | "warning" | "negative" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive:
    "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
  warning: "bg-[rgba(243,184,100,0.14)] text-[#f3b864] border-[rgba(243,184,100,0.4)]",
  negative: "bg-[rgba(238,143,129,0.14)] text-[#ee8f81] border-[rgba(238,143,129,0.4)]",
  neutral: "bg-[var(--ghost)] text-[var(--muted)] border-[rgba(255,255,255,0.14)]",
};

function Badge({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wide whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main id="main-content" className="min-h-screen bg-[var(--black)] px-4 py-10 text-[var(--white)] sm:px-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-[#ee8f81]" role="alert">
        {message}
      </div>
    </main>
  );
}