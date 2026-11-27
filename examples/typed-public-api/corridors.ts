import { createClient, formatApiError } from "./client.js";
import type { CorridorResponse } from "./types.js";

async function main() {
  const baseUrl = process.env.STELLARCORE_API_BASE_URL ?? "http://localhost:3000";
  const corridor = process.env.STELLARCORE_CORRIDOR_SLUG ?? "example-corridor";
  const client = createClient({ baseUrl });

  const result = await client.get<CorridorResponse>(`/api/corridors/${encodeURIComponent(corridor)}`);
  if (!result.ok) {
    console.error("corridor failed", formatApiError(result));
    return;
  }
  const c = result.data.corridor;
  console.log(`${c.sourceAsset}/${c.sourceCountry} -> ${c.destinationAsset}/${c.destinationCountry}`);
  console.log("anchors", c.anchorCount);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
