import { ANCHOR_REGISTRY } from "@/constants/anchors";
import { CORRIDOR_REGISTRY } from "@/constants/corridors";
import { REVIEWED_LIVE_RATE_SOURCES } from "@/constants/liveRateSources";
import { parseDatabaseDecimal } from "@/lib/rates/decimal";
import { computeRateSourceConfigurationFingerprint } from "@/lib/rates/sourceConfigurationFingerprint";
import { discoverAnchor } from "@/lib/stellar/sep1";
import {
  getSep38IndicativePrice,
  getSep38Prices,
  parseSep38AssetIdentifier,
} from "@/lib/stellar/sep38";
import type {
  PreparedLiveRateCandidate,
  ReviewedLiveRateSource,
  SafeLiveRateRunSummary,
} from "@/types/liveRateSource";
import type { RateCandidate, RateEngineResult } from "@/types/rates";
import type { Sep38IndicativePrice } from "@/types/sep38";

export type LiveRateSourceDependencies = Readonly<{
  discover: typeof discoverAnchor;
  prices: typeof getSep38Prices;
}>;

export class LiveRateSourceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LiveRateSourceError";
  }
}

export async function buildReviewedLiveRateCandidates(
  sources: readonly ReviewedLiveRateSource[] = REVIEWED_LIVE_RATE_SOURCES,
  dependencies: LiveRateSourceDependencies = {
    discover: discoverAnchor,
    prices: getSep38Prices,
  },
): Promise<readonly PreparedLiveRateCandidate[]> {
  const candidates: PreparedLiveRateCandidate[] = [];

  for (const source of sources) {
    const anchor = ANCHOR_REGISTRY.find(({ slug }) => slug === source.anchorSlug);
    if (!anchor) throw new LiveRateSourceError("ANCHOR_NOT_REGISTERED");
    const corridor = CORRIDOR_REGISTRY.find(({ slug }) => slug === source.corridorSlug);
    if (!corridor) throw new LiveRateSourceError("CORRIDOR_NOT_REGISTERED");
    validateSourceCorrelation(source, corridor);
    parseDatabaseDecimal(source.sellAmount);

    const discovered = await dependencies.discover(anchor);
    const quoteServer = discovered.endpoints.anchorQuoteServer;
    if (!quoteServer) throw new LiveRateSourceError("SEP38_NOT_ADVERTISED");
    const prices = await dependencies.prices(
      quoteServer,
      { sellAsset: source.sellAsset, sellAmount: source.sellAmount },
    );
    if (!prices.pairs.some(({ sellAsset, buyAsset }) =>
      sellAsset === source.sellAsset && buyAsset === source.buyAsset)) {
      throw new LiveRateSourceError("PAIR_NOT_ADVERTISED");
    }

    candidates.push(Object.freeze({
      anchorSlug: source.anchorSlug,
      corridor,
      quoteServer,
      // Computed from the reviewed source record itself, never from the
      // discovered endpoint, so the digest captures exactly the reviewed
      // configuration the candidate was selected from (#331, #113).
      configurationDigest: computeRateSourceConfigurationFingerprint(source),
      request: Object.freeze({
        sellAsset: source.sellAsset,
        buyAsset: source.buyAsset,
        sellAmount: source.sellAmount,
        ...(source.buyDeliveryMethod
          ? { buyDeliveryMethod: source.buyDeliveryMethod }
          : {}),
        ...(source.countryCode ? { countryCode: source.countryCode } : {}),
        context: source.context,
      }),
    }));
  }

  return Object.freeze(candidates);
}

export async function fetchReviewedIndicativeRate(
  candidate: RateCandidate,
  client: typeof getSep38IndicativePrice = getSep38IndicativePrice,
): Promise<Sep38IndicativePrice> {
  if (!("quoteServer" in candidate) || typeof candidate.quoteServer !== "string") {
    throw new LiveRateSourceError("UNPREPARED_CANDIDATE");
  }
  return client(candidate.quoteServer, candidate.request);
}

export function formatLiveRateRunSummary(
  result: RateEngineResult,
): SafeLiveRateRunSummary {
  return Object.freeze({
    totalCandidates: result.totalCandidates,
    totalAttempted: result.totalAttempted,
    succeeded: result.succeeded,
    failed: result.failed,
    skipped: result.skipped,
    snapshotsPersisted: result.snapshotsPersisted,
    snapshots: Object.freeze(result.snapshots.map((snapshot) => Object.freeze({
      id: snapshot.id,
      anchorSlug: snapshot.anchorSlug,
      corridorSlug: snapshot.corridorSlug,
      rate: snapshot.rate,
      capturedAt: snapshot.capturedAt.toISOString(),
    }))),
    failures: result.failures,
    skippedSources: result.skippedSources,
  });
}

function validateSourceCorrelation(
  source: ReviewedLiveRateSource,
  corridor: (typeof CORRIDOR_REGISTRY)[number],
): void {
  const sell = parseSep38AssetIdentifier(source.sellAsset);
  const buy = parseSep38AssetIdentifier(source.buyAsset);
  if (
    sell.code !== corridor.assetCodeFrom ||
    buy.code !== corridor.assetCodeTo ||
    source.countryCode !== corridor.countryTo ||
    sell.scheme !== "stellar" ||
    !sell.issuer ||
    buy.scheme !== "iso4217"
  ) {
    throw new LiveRateSourceError("SOURCE_CORRELATION_FAILURE");
  }
}
