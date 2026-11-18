import {
  formatDecimal,
  isZeroDecimal,
  parseDatabaseDecimal,
  type ExactDecimal,
} from "@/lib/rates/decimal";

export type FormatRateOptions = Readonly<{
  fallback?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  notation?: "standard" | "compact";
  useGrouping?: boolean;
}>;

export type FormatNumberOptions = Readonly<{
  fallback?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  notation?: "standard" | "compact";
  useGrouping?: boolean;
}>;

/**
 * Deterministic half-up rounding conforming to repository display rules.
 */
export function roundHalfUp(value: number, decimals: number = 0): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return value;
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(value) * factor + 0.5)) / factor;
}

/**
 * Formats a rate value (number, string, or ExactDecimal) for human presentation.
 *
 * Rules:
 * - Small nonzero rates are never rounded to zero where meaningful precision is required.
 * - Large values remain legible with thousands separators or compact notation without layout overflow.
 * - Explicit half-up rounding applies when decimal reduction is requested.
 * - Never mutates the underlying numeric or object value.
 */
export function formatRate(
  value: number | string | ExactDecimal | null | undefined,
  options: FormatRateOptions = {},
): string {
  const fallback = options.fallback ?? "Unavailable";

  if (value === null || value === undefined) {
    return fallback;
  }

  // Handle ExactDecimal object
  if (typeof value === "object") {
    if (!("coefficient" in value) || !("scale" in value)) {
      return fallback;
    }
    // Verify immutability: do not touch value, format via formatDecimal
    if (isZeroDecimal(value)) {
      return options.minimumFractionDigits
        ? `0.${"0".repeat(options.minimumFractionDigits)}`
        : "0";
    }
    const raw = formatDecimal(value);
    return formatDecimalString(raw, options);
  }

  // Handle string value
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return fallback;
    try {
      const parsed = parseDatabaseDecimal(trimmed);
      if (isZeroDecimal(parsed)) {
        return options.minimumFractionDigits
          ? `0.${"0".repeat(options.minimumFractionDigits)}`
          : "0";
      }
      return formatDecimalString(trimmed, options);
    } catch {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || Number.isNaN(num)) return fallback;
      return formatNumberValue(num, options);
    }
  }

  // Handle number value
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      return fallback;
    }
    return formatNumberValue(value, options);
  }

  return fallback;
}

/**
 * Formats a generic numeric value with legibility, precision, and immutability guarantees.
 */
export function formatNumber(
  value: number | string | bigint | ExactDecimal | null | undefined,
  options: FormatNumberOptions = {},
): string {
  if (typeof value === "bigint") {
    const formatted = new Intl.NumberFormat("en-US", {
      useGrouping: options.useGrouping ?? true,
      notation: options.notation ?? "standard",
    }).format(value);
    return formatted;
  }
  return formatRate(value, options);
}

/**
 * Formats rate ticks for charts, avoiding `0.0000` on small nonzero rates
 * and layout overflow on large values.
 */
export function formatRateTick(value: number): string {
  if (!Number.isFinite(value) || Number.isNaN(value)) return "0.0000";
  if (value === 0) return "0.0000";

  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (abs >= 1000) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value);
  }
  if (abs >= 0.001) {
    return value.toFixed(4);
  }

  // Very small non-zero rate: preserve meaningful precision
  const exp = Math.floor(Math.log10(abs));
  const decimals = Math.min(-exp + 2, 8);
  const formatted = value.toFixed(decimals);
  // Ensure we never return all zeros
  if (/^0\.0+$/.test(formatted)) {
    return value.toExponential(2);
  }
  return formatted;
}

function formatNumberValue(value: number, options: FormatRateOptions): string {
  if (value === 0) {
    return options.minimumFractionDigits
      ? `0.${"0".repeat(options.minimumFractionDigits)}`
      : "0";
  }

  const abs = Math.abs(value);

  // Micro-rates: small nonzero rates
  if (abs < 0.0001) {
    const exp = Math.floor(Math.log10(abs));
    const neededDecimals = Math.min(-exp + 3, 12);
    const maxDecimals = Math.max(options.maximumFractionDigits ?? 4, neededDecimals);
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: options.minimumFractionDigits,
      maximumFractionDigits: maxDecimals,
      roundingMode: "halfExpand",
      useGrouping: options.useGrouping ?? true,
      notation: options.notation ?? "standard",
    }).format(value);

    // Guard: never display a nonzero rate as zero
    if (formatted === "0" || /^0\.0+$/.test(formatted)) {
      return value.toFixed(neededDecimals);
    }
    return formatted;
  }

  // Large numbers: >= 1000
  if (abs >= 1000) {
    const maxDecimals = options.maximumFractionDigits ?? 2;
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: options.minimumFractionDigits,
      maximumFractionDigits: maxDecimals,
      roundingMode: "halfExpand",
      useGrouping: options.useGrouping ?? true,
      notation: options.notation ?? "standard",
    }).format(value);
  }

  // Normal range: 0.0001 to 1000
  const maxDecimals = options.maximumFractionDigits ?? 4;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: maxDecimals,
    roundingMode: "halfExpand",
    useGrouping: options.useGrouping ?? true,
    notation: options.notation ?? "standard",
  }).format(value);
}

function formatDecimalString(str: string, options: FormatRateOptions): string {
  const [intPart = "0", fracPart = ""] = str.split(".");
  const isZero = intPart === "0" && (/^0*$/.test(fracPart));

  if (isZero) {
    return options.minimumFractionDigits
      ? `0.${"0".repeat(options.minimumFractionDigits)}`
      : "0";
  }

  if (options.notation === "compact") {
    const num = Number(str);
    if (Number.isFinite(num)) {
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: options.maximumFractionDigits ?? 2,
      }).format(num);
    }
  }

  // Add thousands separators to integer part if useGrouping is not false
  const formattedInt = (options.useGrouping ?? true)
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : intPart;

  if (fracPart.length === 0) {
    if (options.minimumFractionDigits && options.minimumFractionDigits > 0) {
      return `${formattedInt}.${"0".repeat(options.minimumFractionDigits)}`;
    }
    return formattedInt;
  }

  // If maximumFractionDigits is set, apply half-up rounding or truncation carefully
  if (options.maximumFractionDigits !== undefined) {
    const maxFrac = options.maximumFractionDigits;
    if (fracPart.length > maxFrac) {
      const num = Number(str);
      if (Number.isFinite(num)) {
        const rounded = roundHalfUp(num, maxFrac);
        // Guard: small non-zero rates must not be rounded to zero
        if (rounded === 0 && !isZero) {
          // Keep meaningful fraction without rounding to zero
          return `${formattedInt}.${fracPart}`;
        }
        return new Intl.NumberFormat("en-US", {
          minimumFractionDigits: options.minimumFractionDigits,
          maximumFractionDigits: maxFrac,
          useGrouping: options.useGrouping ?? true,
          roundingMode: "halfExpand",
        }).format(num);
      }
    }
  }

  if (options.minimumFractionDigits && fracPart.length < options.minimumFractionDigits) {
    return `${formattedInt}.${fracPart.padEnd(options.minimumFractionDigits, "0")}`;
  }

  return `${formattedInt}.${fracPart}`;
}
