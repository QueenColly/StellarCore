import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCorridorApiResult } from "@/lib/api/corridors";
import { getRatesApiResult } from "@/lib/api/rates";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";
import { CorridorDetailView, CorridorPageError } from "./CorridorDetailView";

type Props = Readonly<{ params: Promise<Readonly<{ slug: string }>> }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getCorridorApiResult(slug);
  if (result.status === 200) {
    const { corridor } = result.body;
    return {
      title: `${corridor.sourceAsset} → ${corridor.destinationAsset} — StellarCore`,
      description: `Read-only evidence for the ${corridor.sourceCountry} to ${corridor.destinationCountry} corridor.`,
    };
  }
  if (result.status === 400 || result.status === 404) {
    return { title: "Corridor not found — StellarCore" };
  }
  return { title: "Corridor unavailable — StellarCore" };
}

export default async function CorridorPage({ params }: Props) {
  const { slug } = await params;
  const corridorResult = await getCorridorApiResult(slug);
  if (corridorResult.status === 404 || corridorResult.status === 400) notFound();
  if (corridorResult.status !== 200) {
    return <CorridorPageError message={corridorResult.body.error.message} />;
  }

  const { corridor } = corridorResult.body;
  const ratesResult = await getRatesApiResult(slug);
  const historyResult = await getRateHistoryApiResult(slug);

  return (
    <CorridorDetailView
      corridor={corridor}
      ratesResult={ratesResult}
      historyResult={historyResult}
    />
  );
}
