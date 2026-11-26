import type { Metadata } from "next";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { MatrixClient } from "./MatrixClient";

export const metadata: Metadata = {
  title: "Anchor-corridor membership matrix — StellarCore",
  description:
    "Evidence matrix of reviewed anchor-to-corridor membership associations across persisted anchors.",
};

export default function AnchorCorridorMatrixPage() {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl">
            <p className="eyebrow">Corridor intelligence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              Anchor-to-corridor membership
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Cross-directory matrix showing which reviewed anchors are configured members of
              reviewed payment corridors.
            </p>
          </header>

          <MatrixClient />
        </div>
      </main>
    </>
  );
}
