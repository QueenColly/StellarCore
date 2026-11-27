import type { Metadata } from "next";
import Link from "next/link";
import { ObservedRateRangePanel } from "@/components/insights/ObservedRateRangePanel";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";

type SearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

type Props = Readonly<{ searchParams: Promise<SearchParams> }>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Observed rate range — StellarCore",
  description:
    "Descriptive min, max, and range of stored indicative rate values within individual corridor snapshots; not a published median.",
};

function paramValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function ObservedRateRangePage({ searchParams }: Props) {
  const params = await searchParams;
  const directory = await getCorridorsApiResult();
  const corridors = directory.status === 200 ? directory.body.corridors : [];
  const requestedSlug = paramValue(params.corridor);
  const selectedSlug = requestedSlug ?? corridors[0]?.slug ?? null;
  const days = paramValue(params.days) ?? "30";
  const selectedIsReviewed = corridors.some((corridor) => corridor.slug === selectedSlug);
  const result = selectedIsReviewed ? await getRateHistoryApiResult(selectedSlug, days) : null;

  return (
    <>
      <ProductHeader current="insights" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <nav
            aria-label="Breadcrumb"
            className="text-xs text-[var(--muted)]"
          >
            <Link
              href="/dashboard"
              className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              Dashboard
            </Link>
            <span aria-hidden="true" className="px-2">
              /
            </span>
            <span aria-current="page">Observed rate range</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Historical analytics</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Observed cross-anchor rate ranges
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Read-only min, max, and absolute range of stored indicative rates
              within individual snapshots. Facts are drawn only from the persisted public
              history response.
            </p>
          </header>

          {directory.status === 200 && corridors.length > 0 ? (
            <form method="GET" className="mt-6 flex flex-wrap items-end gap-4">
              <label className="grid gap-2 text-sm">Reviewed corridor
                <select name="corridor" defaultValue={selectedIsReviewed ? selectedSlug ?? undefined : ""} required className="rounded border border-[var(--ghost)] bg-[var(--surface)] p-2 focus-visible:outline-2">
                  <option value="" disabled>Select a reviewed corridor</option>
                  {corridors.map((corridor) => (
                    <option key={corridor.slug} value={corridor.slug}>{corridor.sourceAsset} ({corridor.sourceCountry}) to {corridor.destinationAsset} ({corridor.destinationCountry})</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm">History days
                <input name="days" type="number" min={1} max={365} step={1} defaultValue={days} required className="w-24 rounded border border-[var(--ghost)] bg-[var(--surface)] p-2 focus-visible:outline-2" />
              </label>
              <button type="submit" className="rounded border border-[var(--ghost)] px-4 py-2 focus-visible:outline-2">Read history</button>
            </form>
          ) : null}
          {directory.status !== 200 ? (
            <p role="alert" className="mt-6 text-sm text-[#ee8f81]">{directory.body.error.message}</p>
          ) : corridors.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--muted)]">No reviewed corridors available.</p>
          ) : result === null ? (
            <p role="alert" className="mt-6 text-sm text-[#ee8f81]">Select a reviewed corridor to read its history.</p>
          ) : result.status !== 200 ? (
            <div
              className="mt-8 max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-sm text-[#ee8f81]"
              role="alert"
            >
              {result.body.error.message}
            </div>
          ) : (
            <ObservedRateRangePanel
              history={result.body}
              stale={result.degraded ?? result.body.degraded}
            />
          )}
        </div>
      </main>
    </>
  );
}
