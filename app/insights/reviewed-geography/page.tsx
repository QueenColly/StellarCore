import type { Metadata } from "next";
import { ProductHeader } from "@/components/ui/ProductHeader";
import { GeographyClient } from "./GeographyClient";

export const metadata: Metadata = {
  title: "Reviewed geography — StellarCore",
  description:
    "Explore source and destination country occurrence across reviewed corridors from the public directory.",
};

export default function ReviewedGeographyPage() {
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
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl" style={{ fontFamily: "var(--display)" }}>
              Reviewed corridor geography
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Explore which sending and receiving countries appear across the public corridor directory.
              This view distinguishes source and destination direction based on reviewed registry configuration,
              without implying real-time corridor liquidity, operational uptime, or executable quotes.
            </p>
          </header>

          <GeographyClient />
        </div>
      </main>
    </>
  );
}
