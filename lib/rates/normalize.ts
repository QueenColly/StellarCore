import {
  absDecimalDiff,
  addDecimals,
  compareDecimals,
  isZeroDecimal,
  maxDecimal,
  multiplyDecimals,
  oneUlp,
  parseDatabaseDecimal,
  type ExactDecimal,
} from "@/lib/rates/decimal";
import { parseSep38AssetIdentifier } from "@/lib/stellar/sep38";
import type { CorridorRegistryEntry } from "@/types/corridor";
import type { NormalizedRateObservation } from "@/types/rates";
import type {
  Sep38AssetIdentifier,
  Sep38FeeDetail,
  Sep38IndicativePrice,
  Sep38IndicativePriceRequest,
} from "@/types/sep38";

export type RateNormalizationCode =
  | "INVALID_ANCHOR"
  | "INVALID_CORRIDOR"
  | "ASSET_MISMATCH"
  | "INVALID_RATE"
  | "INVALID_SOURCE_AMOUNT"
  | "INVALID_DESTINATION_AMOUNT"
  | "INVALID_FEE"
  | "UNSUPPORTED_FEE_ASSET"
  | "INVALID_TIMESTAMP"
  | "ARITHMETIC_INCONSISTENCY";

export class RateNormalizationError extends Error {
  constructor(readonly code: RateNormalizationCode) {
    super(code);
    this.name = "RateNormalizationError";
  }
}

export type NormalizeIndicativeRateInput = Readonly<{
  anchorSlug: string;
  corridor: CorridorRegistryEntry;
  quote: Sep38IndicativePrice;
  capturedAt: Date | string;
  request?: Sep38IndicativePriceRequest;
  expectedSellAsset?: Sep38AssetIdentifier;
  expectedBuyAsset?: Sep38AssetIdentifier;
}>;

export function normalizeIndicativeRate(
  input: NormalizeIndicativeRateInput,
): NormalizedRateObservation {
  if (!isStableSlug(input.anchorSlug)) fail("INVALID_ANCHOR");
  if (!isStableSlug(input.corridor.slug)) fail("INVALID_CORRIDOR");

  const expectedSell = input.request?.sellAsset ?? input.expectedSellAsset;
  const expectedBuy = input.request?.buyAsset ?? input.expectedBuyAsset;

  // Exact asset identifier matches if expected assets provided
  if (expectedSell && input.quote.sellAsset !== expectedSell) {
    fail("ASSET_MISMATCH");
  }
  if (expectedBuy && input.quote.buyAsset !== expectedBuy) {
    fail("ASSET_MISMATCH");
  }

  // Delivery method and context consistency
  if (
    input.request?.buyDeliveryMethod &&
    input.quote.buyDeliveryMethod &&
    input.quote.buyDeliveryMethod !== input.request.buyDeliveryMethod
  ) {
    fail("ASSET_MISMATCH");
  }
  if (
    input.request?.sellDeliveryMethod &&
    input.quote.sellDeliveryMethod &&
    input.quote.sellDeliveryMethod !== input.request.sellDeliveryMethod
  ) {
    fail("ASSET_MISMATCH");
  }
  if (input.request?.countryCode && input.request.countryCode !== input.corridor.countryTo) {
    fail("ASSET_MISMATCH");
  }

  let sellParsed;
  let buyParsed;
  try {
    sellParsed = parseSep38AssetIdentifier(input.quote.sellAsset);
    buyParsed = parseSep38AssetIdentifier(input.quote.buyAsset);
  } catch {
    fail("ASSET_MISMATCH");
  }

  if (
    sellParsed.code !== input.corridor.assetCodeFrom ||
    buyParsed.code !== input.corridor.assetCodeTo
  ) {
    fail("ASSET_MISMATCH");
  }

  // Parse decimals
  const rateDec = parseAndRequireDecimal(input.quote.price, true, "INVALID_RATE");
  const totalPriceDec = parseAndRequireDecimal(input.quote.totalPrice, true, "INVALID_RATE");
  const sourceAmountDec = parseAndRequireDecimal(
    input.quote.sellAmount,
    true,
    "INVALID_SOURCE_AMOUNT",
  );
  const destinationAmountDec = parseAndRequireDecimal(
    input.quote.buyAmount,
    true,
    "INVALID_DESTINATION_AMOUNT",
  );
  const feeDec = parseAndRequireDecimal(input.quote.fee.total, false, "INVALID_FEE");

  if (input.quote.fee.asset !== input.quote.buyAsset) {
    fail("UNSUPPORTED_FEE_ASSET");
  }

  // Validate arithmetic consistency
  validateArithmeticConsistency({
    rate: rateDec,
    totalPrice: totalPriceDec,
    sourceAmount: sourceAmountDec,
    destinationAmount: destinationAmountDec,
    fee: feeDec,
    rateScale: decimalScale(input.quote.price),
    totalPriceScale: decimalScale(input.quote.totalPrice),
    sourceAmountScale: decimalScale(input.quote.sellAmount),
    destinationAmountScale: decimalScale(input.quote.buyAmount),
    feeScale: decimalScale(input.quote.fee.total),
    feeDetails: input.quote.fee.details,
  });

  const capturedAt = input.capturedAt instanceof Date
    ? new Date(input.capturedAt.getTime())
    : new Date(input.capturedAt);
  if (!Number.isFinite(capturedAt.getTime())) fail("INVALID_TIMESTAMP");

  return Object.freeze({
    anchorSlug: input.anchorSlug,
    corridorSlug: input.corridor.slug,
    rate: input.quote.price,
    sourceAmount: input.quote.sellAmount,
    destinationAmount: input.quote.buyAmount,
    fee: input.quote.fee.total,
    capturedAt,
  });
}

function validateArithmeticConsistency(input: Readonly<{
  rate: ExactDecimal;
  totalPrice: ExactDecimal;
  sourceAmount: ExactDecimal;
  destinationAmount: ExactDecimal;
  fee: ExactDecimal;
  rateScale: number;
  totalPriceScale: number;
  sourceAmountScale: number;
  destinationAmountScale: number;
  feeScale: number;
  feeDetails?: readonly Sep38FeeDetail[];
}>): void {
  const {
    rate,
    totalPrice,
    sourceAmount,
    destinationAmount,
    fee,
    rateScale,
    totalPriceScale,
    sourceAmountScale,
    destinationAmountScale,
    feeScale,
    feeDetails,
  } = input;

  if (feeDetails && feeDetails.length > 0) {
    let detailsSum = parseDatabaseDecimal("0");
    for (const detail of feeDetails) {
      const detailDec = parseAndRequireDecimal(detail.amount, false, "INVALID_FEE");
      detailsSum = addDecimals(detailsSum, detailDec);
    }
    if (compareDecimals(detailsSum, fee) !== 0) {
      fail("ARITHMETIC_INCONSISTENCY");
    }
  }

  // SEP-38 price is always sell_asset per one unit of buy_asset. StellarCore's
  // reviewed live sources currently accept fees denominated in buy_asset, so
  // the applicable protocol formulas are:
  //
  //   sell_amount ~= total_price * buy_amount
  //   sell_amount ~= price * (buy_amount + fee)
  //
  // "~=" permits only deterministic decimal rounding. Use the precision that
  // appeared on the wire; parseDatabaseDecimal intentionally strips trailing
  // zeroes and therefore cannot be used to infer the declared ULP.
  const ulpSell = oneUlp(sourceAmountScale);
  const ulpBuy = oneUlp(destinationAmountScale);
  const ulpFee = oneUlp(feeScale);

  const totalProduct = multiplyDecimals(totalPrice, destinationAmount);
  const totalTolerance = maxDecimal(
    multiplyDecimals(totalPrice, ulpBuy),
    ulpSell,
  );
  if (
    compareDecimals(
      absDecimalDiff(sourceAmount, totalProduct),
      totalTolerance,
    ) > 0
  ) {
    fail("ARITHMETIC_INCONSISTENCY");
  }

  const buyPlusFee = addDecimals(destinationAmount, fee);
  const baseProduct = multiplyDecimals(rate, buyPlusFee);
  const baseInputTolerance = addDecimals(ulpBuy, ulpFee);
  const baseTolerance = maxDecimal(
    multiplyDecimals(rate, baseInputTolerance),
    ulpSell,
  );
  if (
    compareDecimals(
      absDecimalDiff(sourceAmount, baseProduct),
      baseTolerance,
    ) > 0
  ) {
    fail("ARITHMETIC_INCONSISTENCY");
  }

  // With no fee, total_price and price describe the same conversion. With a
  // positive buy-asset fee, total_price must not be lower than price.
  const priceTolerance = maxDecimal(
    oneUlp(rateScale),
    oneUlp(totalPriceScale),
  );
  if (isZeroDecimal(fee)) {
    if (compareDecimals(absDecimalDiff(totalPrice, rate), priceTolerance) > 0) {
      fail("ARITHMETIC_INCONSISTENCY");
    }
  } else if (compareDecimals(addDecimals(totalPrice, priceTolerance), rate) < 0) {
    fail("ARITHMETIC_INCONSISTENCY");
  }
}

function decimalScale(value: string): number {
  const separator = value.indexOf(".");
  return separator < 0 ? 0 : value.length - separator - 1;
}

function parseAndRequireDecimal(
  value: string,
  positive: boolean,
  code: RateNormalizationCode,
): ExactDecimal {
  try {
    const decimal = parseDatabaseDecimal(value);
    if (positive && isZeroDecimal(decimal)) fail(code);
    return decimal;
  } catch (error) {
    if (error instanceof RateNormalizationError) throw error;
    fail(code);
  }
}

function isStableSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function fail(code: RateNormalizationCode): never {
  throw new RateNormalizationError(code);
}
