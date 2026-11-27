import Link from "next/link";
import { CorridorRateEvidence } from "@/components/corridors/CorridorRateEvidence";
import { CorridorRateHistoryChart } from "@/components/corridors/CorridorRateHistoryChart";
import { ProductHeader } from "@/components/ui/ProductHeader";
import type { PublicCorridorDetail } from "@/types/api/corridors";
import type { RatesApiResult } from "@/types/api/rates";
import type { RateHistoryApiResult } from "@/types/api/rateHistory";

type Props = Readonly<{
  corridor: PublicCorridorDetail;
  ratesResult: RatesApiResult;
  historyResult: RateHistoryApiResult;
}>;

/**
 * Pure render of the corridor detail page from its three read results.
 *
 * The page owns exactly one `<main id="main-content">`. A latest-rate read
 * failure renders a bounded alert region inside that main, so the corridor
 * heading, associated anchors and (if it succeeded) history stay visible, and
 * a rate failure is never presented as a missing corridor.
 */
export function CorridorDetailView({ corridor, ratesResult, historyResult }: Props) {
  return (
    <>
      <ProductHeader current="detail" />
      <main id="main-content" className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted)]">
            <Link href="/dashboard" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">Dashboard</Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span aria-current="page">{corridor.slug}</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Corridor detail</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              {corridor.sourceAsset} ({corridor.sourceCountry}) → {corridor.destinationAsset} ({corridor.destinationCountry})
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Read-only corridor evidence from StellarCore&apos;s persisted APIs. Configuration and advertised
              interfaces are shown separately from current rate observations.
            </p>
          </header>

          <section aria-labelledby="anchors-heading" className="mt-10">
            <p className="eyebrow">Associated anchors</p>
            <h2 id="anchors-heading" className="mt-2 text-2xl" style={{ fontFamily: "var(--display)" }}>
              {corridor.anchorCount} {corridor.anchorCount === 1 ? "anchor" : "anchors"}
            </h2>
            {corridor.anchors.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--muted)]">No anchors are currently associated with this corridor.</p>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {corridor.anchors.map((anchor) => (
                  <Link
                    key={anchor.slug}
                    href={`/anchors/${anchor.slug}`}
                    className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg text-[var(--white)]" style={{ fontFamily: "var(--display)" }}>{anchor.name}</h3>
                        <p className="mt-1 text-xs text-[var(--muted)]">{anchor.homeDomain}</p>
                      </div>
                      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{anchor.status}</span>
                    </div>
                    <p className="mt-4 text-xs text-[var(--muted)]">
                      {anchor.seps.length > 0 ? `Advertised SEPs: ${anchor.seps.join(", ")}` : "No approved SEP capabilities advertised"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {ratesResult.status === 200 ? (
            <CorridorRateEvidence rates={ratesResult.body} />
          ) : (
            <CorridorRateUnavailable message={ratesResult.body.error.message} />
          )}

          {historyResult.status === 200 ? (
            <CorridorRateHistoryChart
              corridorSlug={corridor.slug}
              initialHistory={historyResult.body}
            />
          ) : null}
        </div>
      </main>
    </>
  );
}

/**
 * Latest-rate read failure for a corridor that exists. A labelled region inside
 * the page's main landmark (never another `<main>`), with alert semantics and
 * safe copy. No median, stale value or rate is fabricated.
 */
export function CorridorRateUnavailable({ message }: Readonly<{ message: string }>) {
  return (
    <section
      aria-labelledby="rate-evidence-heading"
      className="mt-10"
      data-evidence-state="unavailable"
    >
      <p className="eyebrow">Persisted observations</p>
      <h2 id="rate-evidence-heading" className="mt-2 text-2xl" style={{ fontFamily: "var(--display)" }}>
        Latest rate evidence
      </h2>
      <div
        role="alert"
        className="mt-5 rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
          Unavailable<span className="sr-only">: </span>
        </p>
        <p className="mt-2">{message}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Latest rate evidence could not be loaded for this corridor. The corridor itself exists; this does not mean
          evidence is absent, and no median is shown.
        </p>
      </div>
    </section>
  );
}

/**
 * Top-level failure to read the corridor itself (not a 404). Rendered as the
 * page's only main landmark; unchanged from the original page behavior.
 */
export function CorridorPageError({ message }: Readonly<{ message: string }>) {
  return (
    <main id="main-content" className="min-h-screen bg-[var(--black)] px-4 py-10 text-[var(--white)] sm:px-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-[#ee8f81]" role="alert">
        {message}
      </div>
    </main>
  );
}
