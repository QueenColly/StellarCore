import type { PublicRateHistoryPoint, PublicRateHistoryResponse } from "@/types/api/rateHistory";

/**
 * Escapes a string for safe inclusion in a CSV field.
 * Handles quotes, commas, and newlines by wrapping in quotes and
 * doubling any internal quotes.
 */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Formats a rate history point into a CSV row.
 * - corridorSlug: the corridor identifier
 * - timestamp: ISO UTC timestamp from the point
 * - medianRate: the median rate if available, otherwise "—"
 * - sourceCount: total source count
 * - freshSourceCount: fresh source count
 * - observationsCount: number of observations
 */
function pointToCsvRow(
  corridorSlug: string,
  point: PublicRateHistoryPoint,
): string {
  const timestamp = new Date(point.timestamp).toISOString();
  const medianRate = point.medianRate !== null ? point.medianRate : "—";
  const sourceCount = point.sourceCount;
  const freshSourceCount = point.freshSourceCount;
  const observationsCount = point.observations.length;

  return [
    csvEscape(corridorSlug),
    csvEscape(timestamp),
    csvEscape(medianRate),
    csvEscape(String(sourceCount)),
    csvEscape(String(freshSourceCount)),
    csvEscape(String(observationsCount)),
  ].join(",");
}

/**
 * Converts a rate history response into a CSV string.
 * Includes a header row and one row per valid data point.
 * Null median/rate and insufficient-evidence states are represented as "—".
 * Empty or gracefully degraded responses produce a labeled empty outcome.
 */
export function historyToCsv(
  corridorSlug: string,
  response: PublicRateHistoryResponse,
): string {
  const { corridor, points, windowDays, evaluatedAt } = response;

  // Header row
  const header = "Corridor,Timestamp (UTC),Median Rate,Source Count,Fresh Source Count,Observations";

  if (points.length === 0) {
    return `Corridor Rate History CSV (${windowDays}-day window)\n${corridor.slug},,,,,${windowDays}-day window\nNo rate data available for the selected window.`;
  }

  const rows = points.map((point) => pointToCsvRow(corridorSlug, point));

  return [
    `Corridor Rate History CSV (${windowDays}-day window evaluated at ${new Date(
      evaluatedAt,
    ).toISOString()})`,
    header,
    ...rows,
  ].join("\n");
}