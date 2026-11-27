#!/usr/bin/env node

/**
 * Example: Fetching anchor reputation scores via the public read-only API.
 * Usage:
 *   node get-reputation.js [anchor-slug]
 *
 * Demonstrates:
 * - Querying global reputation summary or a specific anchor's reputation score
 * - Validating anchor slug parameter when provided
 * - Interpreting reputation scores, confidence tiers, and evidence counts honestly
 * - Handling missing evidence, null scores, rate limits (429), and degraded states
 */

import { getReputation, getReputationBySlug } from './client.js';
import { pathToFileURL } from 'node:url';

async function main() {
  const slug = process.argv[2];

  try {
    if (slug) {
      console.log(`[INFO] Querying reputation for anchor '${slug}'...`);
      const { data, status, degraded } = await getReputationBySlug(slug);
      console.log(`[SUCCESS] Status: ${status}`);

      if (degraded) {
        console.warn(
          '[WARNING] Response indicates degraded or stale reputation evidence.',
        );
      }

      const score = data?.score ?? data?.reputationScore ?? null;
      const scoreDisplay = score !== null ? `${score}/100` : '(insufficient evidence)';
      const evidenceCount = data?.evidenceCount ?? data?.sampleSize ?? 'N/A';
      const tier = data?.tier || data?.rating || 'unrated';

      console.log(`Anchor: ${slug}`);
      console.log(`  Reputation Score: ${scoreDisplay}`);
      console.log(`  Rating Tier: ${tier}`);
      console.log(`  Evidence Samples: ${evidenceCount}`);

      if (data?.factors && Array.isArray(data.factors)) {
        console.log('  Evaluation Factors:');
        data.factors.forEach((f) => {
          console.log(`    - ${f.name || f.factor}: ${f.score ?? 'N/A'} (${f.status || 'evaluated'})`);
        });
      }

      console.log('\nFull JSON Payload:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('[INFO] Querying global reputation directory...');
      const { data, status, degraded } = await getReputation();
      console.log(`[SUCCESS] Status: ${status}`);

      if (degraded) {
        console.warn(
          '[WARNING] Response indicates degraded or stale reputation evidence.',
        );
      }

      const items = Array.isArray(data?.reputations)
        ? data.reputations
        : Array.isArray(data)
          ? data
          : [];

      console.log(`Retrieved ${items.length} reputation entry/entries:`);
      if (items.length === 0) {
        console.log('  (No reputation entries available)');
      } else {
        items.slice(0, 5).forEach((item, idx) => {
          const name = item.slug || item.anchor || item.name || `Anchor #${idx + 1}`;
          const score = item.score ?? item.reputationScore ?? null;
          const scoreDisplay = score !== null ? `${score}/100` : '(insufficient evidence)';
          console.log(`  - ${name}: Score: ${scoreDisplay} (Tier: ${item.tier || 'unrated'})`);
        });
        if (items.length > 5) {
          console.log(`  ... and ${items.length - 5} more entry/entries`);
        }
      }

      console.log('\nFull JSON Payload:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error(`[ERROR] Failed to fetch reputation data: ${err.message}`);
    if (err.status) console.error(`  Status code: ${err.status} (${err.code})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { main };
