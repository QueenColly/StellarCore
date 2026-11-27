import type { Metadata } from "next";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { MatrixClient } from "./MatrixClient";

export const metadata: Metadata = {
  title: "SEP capability matrix — StellarCore",
  description:
    "Read-only matrix of advertised SEP capabilities across reviewed anchors from last sync.",
};

export default function SepCapabilityMatrixPage() {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl">
            <p className="eyebrow">Anchor intelligence</p>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--display)" }}
            >
              SEP capability matrix
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Cross-anchor comparison of standard SEP capabilities advertised at last sync.
              Columns reflect actual SEP numbers published across reviewed anchors.
            </p>
          </header>

          <MatrixClient />
        </div>
      </main>
    </>
  );
}
