import { createClient, formatApiError } from "./client.js";
import type { RateHistoryResponse, RatesResponse } from "./types.js";

async function main() {
  const baseUrl = process.env.STELLARCORE_API_BASE_URL ?? "http://localhost:3000";
  const corridor = process.env.STELLARCORE_CORRIDOR_SLUG ?? "example-corridor";
  const client = createClient({ baseUrl });

  const rates = await client.get<RatesResponse>(`/api/rates?corridor=${encodeURIComponent(corridor)}`);
  if (!rates.ok) {
    console.error("rates failed", formatApiError(rates));
    return;
  }
  // medianRate can be null when evidence is insufficient; null is not zero.
  if (rates.data.medianRate === null) {
    console.log("median unavailable:", rates.data.state, "fresh sources", rates.data.freshSourceCount);
  } else {
    console.log("indicative median evidence:", rates.data.medianRate, "captured observations", rates.data.observations.length);
  }

  const history = await client.get<RateHistoryResponse>(`/api/rates/history?corridor=${encodeURIComponent(corridor)}&days=30`);
  if (!history.ok) {
    console.error("history failed", formatApiError(history));
    return;
  }
  console.log("history points", history.data.points.length, "windowDays", history.data.windowDays);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
