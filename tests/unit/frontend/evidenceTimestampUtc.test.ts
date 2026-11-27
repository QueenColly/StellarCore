import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import {
  EvidenceTimestamp,
  formatEvidenceTimestamp,
} from "@/components/ui/EvidenceTimestamp";

const CASES = [
  {
    value: "2026-11-20T12:00:00.000Z",
    label: "2026-11-20 12:00:00 UTC",
    dateTime: "2026-11-20T12:00:00.000Z",
  },
  {
    value: "2026-11-20T12:00:00Z",
    label: "2026-11-20 12:00:00 UTC",
    dateTime: "2026-11-20T12:00:00.000Z",
  },
  {
    value: "2026-11-20T14:00:00+02:00",
    label: "2026-11-20 12:00:00 UTC",
    dateTime: "2026-11-20T12:00:00.000Z",
  },
  {
    value: "2026-11-20T07:00:00-05:00",
    label: "2026-11-20 12:00:00 UTC",
    dateTime: "2026-11-20T12:00:00.000Z",
  },
  {
    value: "2026-11-20T12:00:00.125Z",
    label: "2026-11-20 12:00:00.125 UTC",
    dateTime: "2026-11-20T12:00:00.125Z",
  },
  {
    value: "2026-11-20T14:00:00.125+02:00",
    label: "2026-11-20 12:00:00.125 UTC",
    dateTime: "2026-11-20T12:00:00.125Z",
  },
] as const;

test("valid instants render one UTC label without a redundant Z suffix", () => {
  for (const { value, label, dateTime } of CASES) {
    assert.equal(formatEvidenceTimestamp(value), label);
    assert.equal(label.match(/UTC/g)?.length ?? 0, 1);
    assert.doesNotMatch(label, /Z/i);
    assert.equal(
      renderToStaticMarkup(createElement(EvidenceTimestamp, { value })),
      `<time dateTime="${dateTime}">${label}</time>`,
    );
  }
});

test("formatting uses UTC instead of the browser or source offset", () => {
  for (const value of ["2026-11-20T14:00:00+02:00", "2026-11-20T07:00:00-05:00"]) {
    const label = formatEvidenceTimestamp(value);
    assert.equal(label, "2026-11-20 12:00:00 UTC");
    assert.doesNotMatch(label, /[+-]\d{2}:\d{2}/);
    assert.notEqual(label, new Date(value).toString());
  }
});

test("meaningful milliseconds are retained while whole seconds stay concise", () => {
  assert.equal(formatEvidenceTimestamp("2026-11-20T12:00:00.000Z"), "2026-11-20 12:00:00 UTC");
  assert.equal(formatEvidenceTimestamp("2026-11-20T12:00:00.001Z"), "2026-11-20 12:00:00.001 UTC");
  assert.equal(formatEvidenceTimestamp("2026-11-20T12:00:00.999Z"), "2026-11-20 12:00:00.999 UTC");
});

test("missing and invalid values stay unavailable without a time element", () => {
  for (const value of [null, undefined, "", "   ", "not-a-timestamp", "2026-13-45T12:00:00Z"]) {
    assert.equal(formatEvidenceTimestamp(value), "Unavailable");
    const html = renderToStaticMarkup(createElement(EvidenceTimestamp, { value }));
    assert.equal(html, "<span>Unavailable</span>");
    assert.doesNotMatch(html, /<time|UTC|Z/i);
  }
});

test("accessible time elements keep the canonical ISO instant for every valid value", () => {
  for (const { value, dateTime, label } of CASES) {
    const html = renderToStaticMarkup(createElement(EvidenceTimestamp, { value }));
    assert.match(html, /^<time dateTime="[^"]+">[^<]+<\/time>$/);
    assert.ok(html.includes(`dateTime="${dateTime}"`));
    assert.ok(html.endsWith(`>${label}</time>`));
    assert.equal(new Date(dateTime).toISOString(), dateTime);
  }
});
