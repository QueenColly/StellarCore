#!/usr/bin/env node

/**
 * Example: Fetching corridors via the public read-only API.
 * Usage:
 *   node get-corridors.js [slug]
 *
 * Demonstrates:
 * - Safe GET request with Node 22 built-in fetch
 * - Listing supported corridors
 * - Fetching corridor detail by slug
 * - Validating slug input format
 */

import { getCorridors, getCorridorBySlug } from './client.js';
import { pathToFileURL } from 'node:url';

async function main() {
  const slug = process.argv[2];

  try {
    if (slug) {
      console.log(`[INFO] Querying corridor by slug: ${slug}...`);
      const { data, status, degraded } = await getCorridorBySlug(slug);
      console.log(`[SUCCESS] Status: ${status} (Degraded evidence: ${degraded})`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('[INFO] Querying public corridors list (limit=10)...');
      const { data, status, degraded } = await getCorridors({ limit: 10 });
      console.log(`[SUCCESS] Status: ${status} (Degraded evidence: ${degraded})`);
      const items = data?.items || data?.corridors || data || [];
      console.log(`Found ${Array.isArray(items) ? items.length : 'N/A'} corridor(s):`);
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error(`[ERROR] Failed to fetch corridor data: ${err.message}`);
    if (err.status) console.error(`  Status code: ${err.status} (${err.code})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { main };
