#!/usr/bin/env node

/**
 * Example: Fetching FX exchange rates via the public read-only API.
 * Usage:
 *   node get-rates.js [corridor]
 *
 * Demonstrates:
 * - Querying live corridor rates without secrets or mutations
 * - Inspecting median rate, anchor quotes, and observation timestamps
 * - Interpreting degraded headers and nullable median rates honestly
 */

import { getRates } from './client.js';
import { pathToFileURL } from 'node:url';

async function main() {
  const corridor = process.argv[2];

  try {
    console.log(
      `[INFO] Querying current rates${corridor ? ` for corridor: ${corridor}` : ' across all corridors'}...`,
    );
    const { data, status, degraded } = await getRates({ corridor });
    console.log(`[SUCCESS] Status: ${status}`);

    if (degraded) {
      console.warn(
        '[WARNING] Response indicates stale or degraded evidence (x-stale-evidence header present).',
      );
    }

    if (Array.isArray(data)) {
      console.log(`Received ${data.length} rate snapshot(s):`);
      for (const rate of data) {
        const medianDisplay =
          rate.medianRate !== null && rate.medianRate !== undefined
            ? rate.medianRate
            : '(null - insufficient evidence)';
        console.log(`  - Corridor: ${rate.corridor || 'unknown'}`);
        console.log(`    Median Rate: ${medianDisplay}`);
        console.log(`    Sample Count: ${rate.sampleCount ?? rate.quotes?.length ?? 'N/A'}`);
      }
    } else if (data && typeof data === 'object') {
      const medianDisplay =
        data.medianRate !== null && data.medianRate !== undefined
          ? data.medianRate
          : '(null - insufficient evidence)';
      console.log(`  - Corridor: ${data.corridor || corridor || 'unknown'}`);
      console.log(`    Median Rate: ${medianDisplay}`);
      console.log(`    Sample Count: ${data.sampleCount ?? data.quotes?.length ?? 'N/A'}`);
    }

    console.log('\nFull JSON Payload:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[ERROR] Failed to fetch rates: ${err.message}`);
    if (err.status) console.error(`  Status code: ${err.status} (${err.code})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { main };
