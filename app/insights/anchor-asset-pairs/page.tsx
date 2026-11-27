import type { Metadata } from "next";
import Link from "next/link";
import { AnchorAssetPairsPanel } from "@/components/insights/AnchorAssetPairsPanel";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { getAnchorApiResult, getAnchorsApiResult } from "@/lib/api/anchors";

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

type Props = Readonly<{ searchParams: Promise<SearchParams> }>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anchor asset-pair footprint — StellarCore",
  description:
    "Reviewed asset-pair groups associated with a selected anchor from the public anchor directory and detail APIs.",
};

function paramValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function AnchorAssetPairsPage({ searchParams }: Props) {
  const params = await searchParams;
  const directoryResult = await getAnchorsApiResult();
  const anchors =
    directoryResult.status === 200 ? directoryResult.body.anchors : [];
  const selectedSlug = paramValue(params.anchor);
  const resolvedSlug = selectedSlug ?? anchors[0]?.slug ?? null;
  const detailResult = resolvedSlug
    ? await getAnchorApiResult(resolvedSlug)
    : null;

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
            <span aria-current="page">Anchor asset-pair footprint</span>
          </nav>

          <header className="mt-8 max-w-3xl">
            <p className="eyebrow">Anchor intelligence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Reviewed asset-pair footprint
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Read-only grouping of corridor rows associated with a selected
              anchor from the public anchor directory and detail APIs. Facts
              derive only from persisted public responses.
            </p>
          </header>

          {directoryResult.status !== 200 ? (
            <div
              className="mt-8 max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-sm text-[#ee8f81]"
              role="alert"
            >
              {directoryResult.body.error.message}
            </div>
          ) : detailResult && detailResult.status !== 200 ? (
            <div
              className="mt-8 max-w-3xl rounded-lg border border-[rgba(238,143,129,0.35)] p-6 text-sm text-[#ee8f81]"
              role="alert"
            >
              {detailResult.body.error.message}
            </div>
          ) : (
            <AnchorAssetPairsPanel
              anchors={anchors}
              selectedSlug={resolvedSlug}
              anchorDetail={
                detailResult?.status === 200 ? detailResult.body.anchor : null
              }
            />
          )}
        </div>
      </main>
    </>
  );
}
