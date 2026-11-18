import assert from "node:assert/strict";
import test from "node:test";

import { latestObservationsQuery } from "@/lib/rates/latestRateRepository";
import { rateHistoryQuery } from "@/lib/rates/rateHistoryRepository";
import { latestCorridorRatesQuery } from "@/lib/reputation/repository";

const ADVERSARIAL_VALUES = Object.freeze([
  "' OR 1=1--",
  "x'; DROP TABLE rate_snapshots;--",
  "${identifier}",
  "\"; SELECT pg_sleep(10);--",
  "/* comment */ UNION SELECT null",
]);

test("latest-observation raw queries keep adversarial values out of SQL text", () => {
  const baselineRates = latestObservationsQuery("baseline").text;
  const baselineReputation = latestCorridorRatesQuery("baseline").text;

  for (const value of ADVERSARIAL_VALUES) {
    const rates = latestObservationsQuery(value);
    assert.equal(rates.text, baselineRates);
    assert.deepEqual(rates.values, [value]);
    assert.equal(rates.text.includes(value), false);

    const reputation = latestCorridorRatesQuery(value);
    assert.equal(reputation.text, baselineReputation);
    assert.deepEqual(reputation.values, [value]);
    assert.equal(reputation.text.includes(value), false);
  }
});


test("rate-history raw query keeps adversarial corridor ids bound", () => {
  const from = new Date("2026-09-01T00:00:00.000Z");
  const to = new Date("2026-09-02T00:00:00.000Z");
  const baseline = rateHistoryQuery("baseline", from, to).text;

  for (const value of ADVERSARIAL_VALUES) {
    const query = rateHistoryQuery(value, from, to);
    assert.equal(query.text, baseline);
    assert.deepEqual(query.values, [value, from, to]);
    assert.equal(query.text.includes(value), false);
  }
});
