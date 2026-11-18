import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CorridorRateEvidence } from "@/components/corridors/CorridorRateEvidence";
import { CorridorRateHistoryChart } from "@/components/corridors/CorridorRateHistoryChart";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorApiResult } from "@/lib/api/corridors";
import { getRatesApiResult } from "@/lib/api/rates";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";

type Props = Readonly<{ params: Promise<Readonly<{ slug: string }>> }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getCorridorApiResult(slug);
  if (result.status !== 200) return { title: "Corridor not found — StellarCore" };

  const { corridor } = result.body;
  return {
    title: `${corridor.sourceAsset} → ${corridor.destinationAsset} — StellarCore`,
    description: `Read-only evidence for the ${corridor.sourceCountry} to ${corridor.destinationCountry} corridor.`,
  };
}

export default async function CorridorPage({ params }: Props) {
  const { slug } = await params;
  const corridorResult = await getCorridorApiResult(slug);
  if (corridorResult.status === 404 || corridorResult.status === 400) notFound();
  if (corridorResult.status !== 200) {
    return <ErrorState message={corridorResult.body.error.message} />;
  }

  const { corridor } = corridorResult.body;
  const ratesResult = await getRatesApiResult(slug);
  const historyResult = await getRateHistoryApiResult(slug);

  return (
    <>
      <ProductHeader current="dashboard" />
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
            <ErrorState message={ratesResult.body.error.message} />
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

function ErrorState({ message }: { message: string }) {
  return (
    <main id="main-content" className="min-h-screen bg-[var(--black)] px-4 py-10 text-[var(--white)] sm:px-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-[#ee8f81]" role="alert">
        {message}
      </div>
    </main>
  );
}
