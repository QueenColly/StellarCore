#!/usr/bin/env node

/**
 * Example: Fetching anchors via the public read-only API.
 * Usage:
 *   node get-anchors.js [slug]
 *
 * Demonstrates:
 * - Safe GET request with Node 22 built-in fetch
 * - Listing anchors with pagination
 * - Inspecting anchor detail by slug
 * - Handling missing anchors (404) and rate limits (429)
 */

import { getAnchors, getAnchorBySlug } from './client.js';
import { pathToFileURL } from 'node:url';

async function main() {
  const slug = process.argv[2];

  try {
    if (slug) {
      console.log(`[INFO] Querying anchor by slug: ${slug}...`);
      const { data, status, degraded } = await getAnchorBySlug(slug);
      console.log(`[SUCCESS] Status: ${status} (Degraded evidence: ${degraded})`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('[INFO] Querying public anchors list (limit=10)...');
      const { data, status, degraded } = await getAnchors({ limit: 10 });
      console.log(`[SUCCESS] Status: ${status} (Degraded evidence: ${degraded})`);
      const items = data?.items || data?.anchors || data || [];
      console.log(`Found ${Array.isArray(items) ? items.length : 'N/A'} anchor(s):`);
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error(`[ERROR] Failed to fetch anchor data: ${err.message}`);
    if (err.status) console.error(`  Status code: ${err.status} (${err.code})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { main };
