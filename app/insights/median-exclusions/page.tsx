import type { Metadata } from "next";
import Link from "next/link";
import { MedianExclusionsPanel } from "@/components/insights/MedianExclusionsPanel";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getCorridorsApiResult } from "@/lib/api/corridors";
import { getRatesApiResult } from "@/lib/api/rates";

type SearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

type Props = Readonly<{ searchParams: Promise<SearchParams> }>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Median exclusion reasons — StellarCore",
  description:
    "Grouped audit of persisted latest-rate observations excluded from corridor median publication, by recorded exclusion reason.",
};

function paramValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function MedianExclusionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const directoryResult = await getCorridorsApiResult();
  const corridors =
    directoryResult.status === 200 ? directoryResult.body.corridors : [];
  const selectedSlug = paramValue(params.corridor);
  const resolvedSlug = selectedSlug ?? corridors[0]?.slug ?? null;
  const ratesResult = resolvedSlug
    ? await getRatesApiResult(resolvedSlug)
    : null;
  const ratesLoaded = ratesResult !== null && ratesResult.status === 200;

  return (
    <>
      <ProductHeader current="dashboard" />
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
            <span aria-current="page">Median exclusion audit</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Rate evidence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Median exclusion reasons
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Grouped audit of persisted latest-rate observations for a
              selected corridor. Facts derive only from the public rates
              response; eligible observations are counted separately.
            </p>
          </header>

          {directoryResult.status !== 200 ? (
            <div
              className="mt-8 max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-sm text-[#ee8f81]"
              role="alert"
            >
              {directoryResult.body.error.message}
            </div>
          ) : ratesResult !== null && ratesResult.status !== 200 ? (
            <div
              className="mt-8 max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-sm text-[#ee8f81]"
              role="alert"
            >
              {ratesResult.body.error.message}
            </div>
          ) : (
            <MedianExclusionsPanel
              corridors={corridors}
              selectedSlug={resolvedSlug}
              rates={ratesLoaded ? ratesResult.body : null}
              stale={ratesLoaded ? ratesResult.degraded : undefined}
            />
          )}
        </div>
      </main>
    </>
  );
}
