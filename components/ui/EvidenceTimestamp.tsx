import React from "react";

type Props = Readonly<{
  value: string | null | undefined;
}>;

/** Render a persisted evidence timestamp in stable, explicitly UTC form. */
export function formatEvidenceTimestamp(
  value: string | null | undefined,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Unavailable";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "Unavailable";
  }

  const label = date.toISOString()
    .replace("T", " ")
    .replace(/\.000Z$/, "Z")
    .replace(/Z$/, "");

  return `${label} UTC`;
}

export function EvidenceTimestamp({ value }: Props) {
  const label = formatEvidenceTimestamp(value);
  const date = typeof value === "string" ? new Date(value) : null;

  return date && Number.isFinite(date.getTime()) ? (
    <time dateTime={date.toISOString()}>{label}</time>
  ) : (
    <span>{label}</span>
  );
}
