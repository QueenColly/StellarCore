import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeCsvCell,
  sanitizeForFormulaInjection,
  serializeCsv,
  serializeCsvRow,
} from "@/lib/directoryCsv/csvEscaping";
import {
  ANCHOR_CSV_HEADERS,
  CORRIDOR_CSV_HEADERS,
  formatAnchorRow,
  formatCorridorRow,
  generateDirectoryCsvFilename,
} from "@/lib/directoryCsv/formatters";
import {
  fetchAllAnchors,
  fetchAllCorridors,
} from "@/lib/directoryCsv/fetchers";
import {
  buildAnchorsCsv,
  buildCorridorsCsv,
  exportDirectoryAsCsv,
} from "@/lib/directoryCsv/exporter";
import type { PublicAnchorSummary } from "@/types/api/anchors";
import type { PublicCorridor } from "@/types/api/corridors";

test("formula injection neutralization prepends single quote to dangerous triggers", () => {
  assert.equal(sanitizeForFormulaInjection("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.equal(sanitizeForFormulaInjection("+12345"), "'+12345");
  assert.equal(sanitizeForFormulaInjection("-2+3"), "'-2+3");
  assert.equal(sanitizeForFormulaInjection("@SUM(A1:A10)"), "'@SUM(A1:A10)");
  assert.equal(sanitizeForFormulaInjection("\tindent"), "'\tindent");
  assert.equal(sanitizeForFormulaInjection("\rcarriage"), "'\rcarriage");
  assert.equal(sanitizeForFormulaInjection("|pipe"), "'|pipe");
  assert.equal(sanitizeForFormulaInjection("safe text"), "safe text");
  assert.equal(sanitizeForFormulaInjection(""), "");
});

test("escapeCsvCell properly quotes cells containing commas, quotes, newlines and neutralized formulas", () => {
  // Simple value
  assert.equal(escapeCsvCell("simple"), "simple");

  // Quotes
  assert.equal(escapeCsvCell('hello "world"'), '"hello ""world"""');

  // Commas
  assert.equal(escapeCsvCell("apple, banana"), '"apple, banana"');

  // Newlines
  assert.equal(escapeCsvCell("line1\nline2"), '"line1\nline2"');

  // Formula trigger (neutralized with ' then quoted because it starts with ')
  assert.equal(escapeCsvCell("=1+1"), `"'=1+1"`);

  // Null and undefined
  assert.equal(escapeCsvCell(null), "");
  assert.equal(escapeCsvCell(undefined), "");

  // Booleans and numbers
  assert.equal(escapeCsvCell(true), "true");
  assert.equal(escapeCsvCell(false), "false");
  assert.equal(escapeCsvCell(42), "42");

  // Arrays (joined by semicolon, which is quoted for cross-locale safety)
  assert.equal(escapeCsvCell([1, 24, 31]), '"1; 24; 31"');
});

test("deterministic CSV serialization preserves Unicode characters", () => {
  const headers = ["ID", "Name", "Symbol", "Description"];
  const rows = [
    ["cowrie", "Cowrie NGN", "₦", "Nigerian Naira anchor"],
    ["zeam", "Zeäm EUR", "€", "European Union Gateway®"],
    ["jp", "円 Japan", "¥", "Japanese Yen 日本語"],
  ];

  const csv = serializeCsv(headers, rows);
  assert.ok(csv.includes("₦"));
  assert.ok(csv.includes("€"));
  assert.ok(csv.includes("Zeäm"));
  assert.ok(csv.includes("日本語"));
  assert.ok(csv.startsWith("ID,Name,Symbol,Description\r\n"));
});

test("resource-identifying filenames are deterministic and formatted by date", () => {
  const fixedDate = new Date("2026-11-24T12:00:00Z");
  assert.equal(
    generateDirectoryCsvFilename("anchors", fixedDate),
    "stellar-anchors-directory-2026-11-24.csv",
  );
  assert.equal(
    generateDirectoryCsvFilename("corridors", fixedDate),
    "stellar-corridors-directory-2026-11-24.csv",
  );
});

test("anchor CSV formatting includes last persisted sync status and excludes live uptime claims", () => {
  assert.ok(ANCHOR_CSV_HEADERS.includes("Last Persisted Sync Status"));
  assert.ok(ANCHOR_CSV_HEADERS.includes("Advertised Transfer Interface"));
  assert.equal(ANCHOR_CSV_HEADERS.includes("Live Uptime"), false);
  assert.equal(ANCHOR_CSV_HEADERS.includes("Operational Reliability"), false);

  const mockAnchor: PublicAnchorSummary = {
    slug: "cowrie",
    name: "Cowrie",
    homeDomain: "cowrie.example",
    status: "LIVE",
    seps: [1, 24, 31],
    isTransferCapable: true,
    corridorCount: 2,
  };

  const row = formatAnchorRow(mockAnchor);
  assert.deepEqual(row, [
    "cowrie",
    "Cowrie",
    "cowrie.example",
    "LIVE",
    "SEP-1; SEP-24; SEP-31",
    true,
    2,
  ]);

  const csv = buildAnchorsCsv([mockAnchor]);
  assert.ok(csv.includes("Last Persisted Sync Status"));
  assert.ok(csv.includes("cowrie,Cowrie,cowrie.example,LIVE,\"SEP-1; SEP-24; SEP-31\",true,2"));
});

test("corridor CSV formatting matches public corridor schema", () => {
  assert.deepEqual(CORRIDOR_CSV_HEADERS, [
    "Slug",
    "Source Asset",
    "Source Country",
    "Destination Asset",
    "Destination Country",
    "Anchor Count",
  ]);

  const mockCorridor: PublicCorridor = {
    slug: "usdc-us-brl-br",
    sourceAsset: "USDC",
    sourceCountry: "US",
    destinationAsset: "BRL",
    destinationCountry: "BR",
    anchorCount: 2,
  };

  const row = formatCorridorRow(mockCorridor);
  assert.deepEqual(row, ["usdc-us-brl-br", "USDC", "US", "BRL", "BR", 2]);

  const csv = buildCorridorsCsv([mockCorridor]);
  assert.ok(csv.includes("usdc-us-brl-br,USDC,US,BRL,BR,2"));
});

test("empty array export produces clean CSV header row without data", () => {
  const csv = buildAnchorsCsv([]);
  assert.equal(csv, ANCHOR_CSV_HEADERS.join(","));
});

test("pagination handles partial pages and stops at safety limit", async () => {
  let callCount = 0;
  const mockFetch = async (url: string): Promise<Response> => {
    callCount++;
    const parsed = new URL(url, "http://localhost");
    const limit = Number(parsed.searchParams.get("limit"));
    const offset = Number(parsed.searchParams.get("offset"));

    // Return batches of items
    const anchors: PublicAnchorSummary[] = Array.from({ length: limit }, (_, i) => ({
      slug: `anchor-${offset + i}`,
      name: `Anchor ${offset + i}`,
      homeDomain: `anchor${offset + i}.example`,
      status: "LIVE",
      seps: [1, 24],
      isTransferCapable: true,
      corridorCount: 1,
    }));

    return new Response(JSON.stringify({ anchors, count: anchors.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  // Test with safety limit of 150 items and page size of 50
  const result = await fetchAllAnchors(
    { pageSize: 50, maxLimit: 150 },
    mockFetch,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.items.length, 150);
    assert.equal(result.isPartial, true);
    assert.equal(result.safetyLimit, 150);
  }
  assert.equal(callCount, 3);
});

test("pagination cleanly stops when API returns fewer items than page limit", async () => {
  const mockFetch = async (): Promise<Response> => {
    const anchors: PublicAnchorSummary[] = [
      {
        slug: "only-one",
        name: "Only One",
        homeDomain: "one.example",
        status: "LIVE",
        seps: [1],
        isTransferCapable: false,
        corridorCount: 0,
      },
    ];

    return new Response(JSON.stringify({ anchors, count: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await fetchAllAnchors({ pageSize: 50, maxLimit: 100 }, mockFetch);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.items.length, 1);
    assert.equal(result.isPartial, false);
  }
});

test("API failures report honest error without fabricating data", async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({ error: { message: "Database temporarily offline" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await exportDirectoryAsCsv("anchors", {}, mockFetch);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes("Database temporarily offline"));
  }
});

test("malformed directory records cannot become empty or fabricated zero-value exports", async () => {
  const anchor = { slug: "anchor", name: "Anchor", homeDomain: "anchor.example", status: "LIVE", seps: [1] };
  const corridor = { slug: "corridor", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR" };
  for (const body of [
    { unexpected: [] },
    { anchors: [anchor], count: 1 },
    { anchors: [], count: 1 },
    { anchors: [{ ...anchor, isTransferCapable: false, corridorCount: 0, status: "unrecognized" }], count: 1 },
  ]) {
    const result = await fetchAllAnchors({}, async () => Response.json(body));
    assert.equal(result.ok, false);
  }
  for (const body of [{ corridors: [corridor], count: 1 }, { corridors: [], count: 1 }]) {
    const result = await fetchAllCorridors({}, async () => Response.json(body));
    assert.equal(result.ok, false);
  }
});

test("duplicate slugs across pages cancel export instead of inflating evidence counts", async () => {
  const corridor: PublicCorridor = { slug: "corridor", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR", anchorCount: 0 };
  const result = await fetchAllCorridors({ pageSize: 1 }, async () => Response.json({ corridors: [corridor], count: 1 }));
  assert.equal(result.ok, false);
});

test("invalid pagination is rejected before any network request", async () => {
  const neverFetch = async (): Promise<Response> => { assert.fail("invalid options must not fetch"); };
  for (const options of [{ pageSize: 0 }, { pageSize: 1.5 }, { maxLimit: 1001 }]) {
    assert.equal((await fetchAllAnchors(options, neverFetch)).ok, false);
    assert.equal((await fetchAllCorridors(options, neverFetch)).ok, false);
  }
});
