import type { Metadata } from "next";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { ANCHOR_REGISTRY } from "@/constants/anchors";
import { CORRIDOR_REGISTRY } from "@/constants/corridors";
import { ExplorerClient } from "./ExplorerClient";

export const metadata: Metadata = {
  title: "Public API explorer — StellarCore",
  description:
    "Inspect StellarCore's public read-only GET APIs with constrained, allowlisted requests.",
};

export default function DeveloperExplorerPage() {
  const anchorSlugs = ANCHOR_REGISTRY.map(({ slug }) => slug);
  const corridorSlugs = CORRIDOR_REGISTRY.map(({ slug }) => slug);

  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl">
            <p className="eyebrow">Developers</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              Public API explorer
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Send allowlisted, same-origin GET requests to StellarCore&apos;s public read-only APIs and inspect the
              real response structure. Inputs are limited to reviewed registry slugs and bounded values. No arbitrary
              URL, method, header, credential, or request body can be sent, and nothing is modified.
            </p>
          </header>

          <ExplorerClient anchorSlugs={anchorSlugs} corridorSlugs={corridorSlugs} />
        </div>
      </main>
    </>
  );
}
