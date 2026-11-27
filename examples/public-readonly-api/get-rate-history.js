#!/usr/bin/env node

/**
 * Example: Fetching historical rate observations via the public read-only API.
 * Usage:
 *   node get-rate-history.js <corridor> [days]
 *
 * Demonstrates:
 * - Querying rate history for a corridor over a given day window (default 30)
 * - Validating corridor slug and days input
 * - Handling empty history or insufficient sample points honestly
 * - Handling rate limits (429) and server degraded flags
 */

import { getRateHistory } from './client.js';
import { pathToFileURL } from 'node:url';

async function main() {
  const corridor = process.argv[2] || 'usdc-brl';
  const days = process.argv[3] !== undefined ? Number(process.argv[3]) : 30;

  try {
    console.log(
      `[INFO] Querying rate history for corridor '${corridor}' over ${days} day(s)...`,
    );
    const { data, status, degraded } = await getRateHistory({ corridor, days });
    console.log(`[SUCCESS] Status: ${status}`);

    if (degraded) {
      console.warn(
        '[WARNING] Response indicates degraded or stale history observations.',
      );
    }

    const points = Array.isArray(data?.history)
      ? data.history
      : Array.isArray(data)
        ? data
        : [];

    console.log(`Retrieved ${points.length} history point(s):`);
    if (points.length === 0) {
      console.log('  (No observation points available for this corridor and window)');
    } else {
      points.slice(0, 5).forEach((p, idx) => {
        const rate = p.medianRate ?? p.rate ?? '(insufficient evidence)';
        const time = p.timestamp || p.date || p.evaluatedAt || `Point #${idx + 1}`;
        console.log(`  [${time}] Rate: ${rate}`);
      });
      if (points.length > 5) {
        console.log(`  ... and ${points.length - 5} more point(s)`);
      }
    }

    console.log('\nFull JSON Payload:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[ERROR] Failed to fetch rate history: ${err.message}`);
    if (err.status) console.error(`  Status code: ${err.status} (${err.code})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { main };
