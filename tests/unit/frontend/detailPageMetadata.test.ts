import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

const anchorPage = read("app/anchors/[slug]/page.tsx");
const corridorPage = read("app/corridors/[slug]/page.tsx");

test("anchor generateMetadata returns not-found only for 400/404 and unavailable for other failures", () => {
  assert.match(anchorPage, /if \(result\.status === 200\) \{[\s\S]*?title: `\$\{anchor\.name\} — StellarCore`/);
  assert.match(anchorPage, /if \(result\.status === 400 \|\| result\.status === 404\) \{[\s\S]*?title: "Anchor not found — StellarCore"/);
  assert.match(anchorPage, /return \{ title: "Anchor unavailable — StellarCore" \};/);
  assert.doesNotMatch(anchorPage, /if \(result\.status !== 200\) return \{ title: "Anchor not found — StellarCore" \};/);
});

test("corridor generateMetadata returns not-found only for 400/404 and unavailable for other failures", () => {
  assert.match(corridorPage, /if \(result\.status === 200\) \{[\s\S]*?title: `\$\{corridor\.sourceAsset\} → \$\{corridor\.destinationAsset\} — StellarCore`/);
  assert.match(corridorPage, /if \(result\.status === 400 \|\| result\.status === 404\) \{[\s\S]*?title: "Corridor not found — StellarCore"/);
  assert.match(corridorPage, /return \{ title: "Corridor unavailable — StellarCore" \};/);
  assert.doesNotMatch(corridorPage, /if \(result\.status !== 200\) return \{ title: "Corridor not found — StellarCore" \};/);
});

test("metadata failure titles do not leak internal error details", () => {
  for (const source of [anchorPage, corridorPage]) {
    const metadataBlock = source.match(/export async function generateMetadata[\s\S]*?^}/m)?.[0] ?? "";
    assert.ok(metadataBlock.length > 0, "generateMetadata must exist");
    assert.doesNotMatch(metadataBlock, /body\.error|message|stack|exception/i);
  }
});
