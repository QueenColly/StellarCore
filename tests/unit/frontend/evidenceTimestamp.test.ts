import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import {
  EvidenceTimestamp,
  formatEvidenceTimestamp,
} from "@/components/ui/EvidenceTimestamp";

test("persisted evidence timestamps render consistently with an explicit UTC timezone", () => {
  assert.equal(
    formatEvidenceTimestamp("2025-04-03T10:15:30.000Z"),
    "2025-04-03 10:15:30Z UTC",
  );
  assert.equal(
    renderToStaticMarkup(
      createElement(EvidenceTimestamp, {
        value: "2025-04-03T12:15:30+02:00",
      }),
    ),
    '<time dateTime="2025-04-03T10:15:30.000Z">2025-04-03 10:15:30Z UTC</time>',
  );
});

test("missing and malformed timestamps are unavailable and never replaced with the current time", () => {
  for (const value of [null, undefined, "", "not-a-timestamp"]) {
    assert.equal(formatEvidenceTimestamp(value), "Unavailable");
    assert.equal(
      renderToStaticMarkup(createElement(EvidenceTimestamp, { value })),
      "<span>Unavailable</span>",
    );
  }
});
