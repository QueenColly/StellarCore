import { SectionSkeleton } from "@/components/dashboard/SectionStates";
import { ProductHeader } from "@/components/ui/ProductHeader";

export default function DashboardLoading() {
  return (
    <>
      <ProductHeader current="dashboard" />
      <main
        id="main-content"
        className="min-h-screen bg-[var(--black)] px-4 py-8 text-[var(--white)] sm:px-8 sm:py-10 lg:px-12"
      >
        <div className="mx-auto max-w-6xl space-y-8">
          <div aria-hidden="true" className="h-10 w-64 animate-pulse rounded bg-[var(--ghost)]" />
          <SectionSkeleton label="anchors" />
          <SectionSkeleton label="corridors" />
          <SectionSkeleton label="rates" />
          <SectionSkeleton label="reputation" />
        </div>
      </main>
    </>
  );
}
