import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  formatNumber,
  formatRate,
  formatRateTick,
  roundHalfUp,
} from "@/lib/rates/formatting";
import { parseDatabaseDecimal } from "@/lib/rates/decimal";

describe("Rate and number formatting utilities", () => {
  describe("Small nonzero rates", () => {
    test("formats floating-point micro-rates with meaningful precision", () => {
      const formatted = formatRate(0.00001234);
      assert.equal(formatted, "0.00001234");
      assert.notEqual(formatted, "0");
      assert.notEqual(formatted, "0.00");
      assert.notEqual(formatted, "0.0000");
    });

    test("formats scientific-notation small rates without collapsing to zero", () => {
      const formatted = formatRate(1e-6);
      assert.equal(formatted, "0.000001");
      assert.notEqual(formatted, "0");
      assert.notEqual(formatted, "0.00");

      const formattedSmall = formatRate(0.00000001);
      assert.equal(formattedSmall, "0.00000001");
    });

    test("formats string micro-rates preserving exact wire precision", () => {
      const wireRate = "0.00001234";
      const formatted = formatRate(wireRate);
      assert.equal(formatted, "0.00001234");
      assert.notEqual(formatted, "0");

      const highPrecision = "0.000000000000000001";
      const formattedHigh = formatRate(highPrecision);
      assert.equal(formattedHigh, "0.000000000000000001");
    });

    test("formats ExactDecimal micro-rates without premature zero-rounding", () => {
      const decimal = parseDatabaseDecimal("0.00001234");
      const formatted = formatRate(decimal);
      assert.equal(formatted, "0.00001234");
      assert.notEqual(formatted, "0");
      assert.notEqual(formatted, "0.00");
    });

    test("never rounds small nonzero rate to zero even when maximumFractionDigits is constrained", () => {
      const formatted = formatRate(0.00001234, { maximumFractionDigits: 4 });
      assert.notEqual(formatted, "0");
      assert.notEqual(formatted, "0.00");
      assert.notEqual(formatted, "0.0000");
      assert.match(formatted, /0\.0+1234/);
    });

    test("formatRateTick produces readable ticks for micro-rates without displaying 0.0000", () => {
      const tick = formatRateTick(0.00001234);
      assert.notEqual(tick, "0.0000");
      assert.match(tick, /^0\.0+12/);

      const midTick = formatRateTick(0.00000617);
      assert.notEqual(midTick, "0.0000");
      assert.match(midTick, /^0\.0+/);
    });
  });

  describe("Large values", () => {
    test("formats large numbers with readable thousand separators", () => {
      const formatted = formatRate(1234567.89);
      assert.equal(formatted, "1,234,567.89");

      const largeRate = formatRate(999999999999.99);
      assert.equal(largeRate, "999,999,999,999.99");
    });

    test("formats large string rates without precision loss or overflow", () => {
      const formatted = formatRate("999999999999.99");
      assert.equal(formatted, "999,999,999,999.99");

      const extremeDecimal = "123456789012345678.123456789012345678";
      const formattedExtreme = formatRate(extremeDecimal);
      assert.equal(
        formattedExtreme,
        "123,456,789,012,345,678.123456789012345678",
      );
    });

    test("formats large ExactDecimal values with grouped integer components", () => {
      const decimal = parseDatabaseDecimal("999999999999.99");
      const formatted = formatRate(decimal);
      assert.equal(formatted, "999,999,999,999.99");
    });

    test("formats large values compactly when requested for layout constraints", () => {
      const formatted = formatRate(1000000, { notation: "compact" });
      assert.equal(formatted, "1M");

      const formattedBillions = formatRate(999999999999.99, { notation: "compact" });
      assert.match(formattedBillions, /1T|999\.99B|1000B/i);
    });

    test("formatRateTick scales large numbers to prevent chart margin overflow", () => {
      const millionTick = formatRateTick(1000000);
      assert.equal(millionTick, "1M");

      const fiveMillionTick = formatRateTick(5000000);
      assert.equal(fiveMillionTick, "5M");

      const thousandTick = formatRateTick(1500.5);
      assert.equal(thousandTick, "1,500.5");
    });

    test("formatNumber supports BigInt values with grouping", () => {
      const big = BigInt("1000000000000");
      assert.equal(formatNumber(big), "1,000,000,000,000");
    });
  });

  describe("Documented rounding rules", () => {
    test("roundHalfUp applies deterministic half-up rounding", () => {
      // 0.5 rounds away from zero (half-up)
      assert.equal(roundHalfUp(2.5, 0), 3);
      assert.equal(roundHalfUp(1.5, 0), 2);
      assert.equal(roundHalfUp(1.235, 2), 1.24);
      assert.equal(roundHalfUp(1.234, 2), 1.23);
      assert.equal(roundHalfUp(-1.5, 0), -2);
      assert.equal(roundHalfUp(-2.5, 0), -3);
    });

    test("rounding tier for values >= 1000 defaults to 2 fraction digits", () => {
      const formatted = formatRate(1250.5678);
      assert.equal(formatted, "1,250.57");
    });

    test("rounding tier for normal values between 1 and 1000 defaults to 4 fraction digits", () => {
      const formatted = formatRate(5.123456);
      assert.equal(formatted, "5.1235");

      const exactFour = formatRate(1.2345);
      assert.equal(exactFour, "1.2345");
    });

    test("zero values format as 0 and respect minimumFractionDigits", () => {
      assert.equal(formatRate(0), "0");
      assert.equal(formatRate("0"), "0");
      assert.equal(formatRate("0.00"), "0");
      assert.equal(formatRate(0, { minimumFractionDigits: 2 }), "0.00");
      assert.equal(formatRate("0", { minimumFractionDigits: 4 }), "0.0000");
    });

    test("null and undefined values return fallback string without throwing", () => {
      assert.equal(formatRate(null), "Unavailable");
      assert.equal(formatRate(undefined), "Unavailable");
      assert.equal(formatRate(null, { fallback: "—" }), "—");
      assert.equal(formatRate(NaN), "Unavailable");
    });
  });

  describe("Immutability of underlying values", () => {
    test("formatting does not mutate ExactDecimal object", () => {
      const original = parseDatabaseDecimal("0.00001234");
      const coefficientBefore = original.coefficient;
      const scaleBefore = original.scale;

      const result = formatRate(original);
      assert.equal(result, "0.00001234");
      assert.equal(original.coefficient, coefficientBefore);
      assert.equal(original.scale, scaleBefore);
      assert.equal(Object.isFrozen(original), true);
    });

    test("formatting does not mutate parent numeric containers or objects", () => {
      const container = {
        rate: 0.00001234,
        fee: "0.01",
        largeRate: 999999999999.99,
      };

      const rateFormatted = formatRate(container.rate);
      const feeFormatted = formatRate(container.fee);
      const largeFormatted = formatRate(container.largeRate);

      assert.equal(container.rate, 0.00001234);
      assert.equal(container.fee, "0.01");
      assert.equal(container.largeRate, 999999999999.99);

      assert.equal(rateFormatted, "0.00001234");
      assert.equal(feeFormatted, "0.01");
      assert.equal(largeFormatted, "999,999,999,999.99");
    });

    test("formatting array of rates preserves original array and elements", () => {
      const rates = [0.00001234, 1.25, 999999999.99];
      const snapshot = [...rates];

      const formatted = rates.map((r) => formatRate(r));
      assert.deepEqual(rates, snapshot);
      assert.equal(formatted[0], "0.00001234");
      assert.equal(formatted[1], "1.25");
      assert.equal(formatted[2], "999,999,999.99");
    });
  });
});
