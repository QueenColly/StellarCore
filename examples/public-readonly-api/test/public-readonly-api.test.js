import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  safePublicGet,
  getAnchors,
  getAnchorBySlug,
  getCorridors,
  getCorridorBySlug,
  getRates,
  getRateHistory,
  getReputation,
  getReputationBySlug,
  validateSlug,
  validateDays,
} from '../client.js';

function createMockFetch({ status = 200, statusText = 'OK', headers = {}, body = {} } = {}) {
  const headerMap = new Map();
  for (const [k, v] of Object.entries(headers)) {
    headerMap.set(k.toLowerCase(), String(v));
  }
  if (!headerMap.has('content-type')) {
    headerMap.set('content-type', 'application/json');
  }

  return async function mockFetch(url, options = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: {
        get: (h) => headerMap.get(h.toLowerCase()) ?? null,
      },
      json: async () => {
        if (typeof body === 'string') {
          return JSON.parse(body);
        }
        return body;
      },
      url,
      options,
    };
  };
}

describe('StellarCore Public Read-Only API Client', () => {
  describe('Input Validation', () => {
    it('validates corridor and anchor slugs correctly', () => {
      assert.equal(validateSlug('usdc-brl'), 'usdc-brl');
      assert.equal(validateSlug('anchor_123'), 'anchor_123');
      assert.equal(validateSlug('  stellar  '), 'stellar');

      assert.throws(() => validateSlug(''), /non-empty string/);
      assert.throws(() => validateSlug(null), /non-empty string/);
      assert.throws(() => validateSlug('bad/slug'), /invalid characters/);
      assert.throws(() => validateSlug('slug?injection=1'), /invalid characters/);
      assert.throws(() => validateSlug('slug;rm -rf'), /invalid characters/);
    });

    it('validates history days parameter correctly', () => {
      assert.equal(validateDays(30), 30);
      assert.equal(validateDays('7'), 7);
      assert.equal(validateDays(undefined), undefined);
      assert.equal(validateDays(null), undefined);

      assert.throws(() => validateDays(0), /between 1 and 365/);
      assert.throws(() => validateDays(-5), /between 1 and 365/);
      assert.throws(() => validateDays(366), /between 1 and 365/);
      assert.throws(() => validateDays(14.5), /between 1 and 365/);
      assert.throws(() => validateDays('abc'), /between 1 and 365/);
    });
  });

  describe('Success Endpoints (200 OK)', () => {
    it('fetches list of anchors', async () => {
      const mockPayload = { anchors: [{ slug: 'my-anchor', name: 'My Anchor' }] };
      const fetchFn = createMockFetch({ status: 200, body: mockPayload });
      const result = await getAnchors({ fetchFn });

      assert.equal(result.status, 200);
      assert.equal(result.degraded, false);
      assert.deepEqual(result.data, mockPayload);
    });

    it('fetches single anchor by slug with query parameters', async () => {
      let requestedUrl = null;
      const mockPayload = { anchor: { slug: 'circle', name: 'Circle' } };
      const fetchFn = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => mockPayload,
        };
      };

      const result = await getAnchorBySlug('circle', { fetchFn });
      assert.equal(result.status, 200);
      assert.equal(requestedUrl, 'http://localhost:3000/api/anchors/circle');
    });

    it('fetches corridors with pagination params', async () => {
      let requestedUrl = null;
      const mockPayload = { corridors: [{ id: 'usdc-brl' }] };
      const fetchFn = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => mockPayload,
        };
      };

      const result = await getCorridors({ limit: 10, page: 2, fetchFn });
      assert.equal(result.status, 200);
      assert.equal(requestedUrl, 'http://localhost:3000/api/corridors?limit=10&page=2');
    });

    it('fetches single corridor by slug', async () => {
      let requestedUrl = null;
      const mockPayload = { corridor: { id: 'xlm-usd' } };
      const fetchFn = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => mockPayload,
        };
      };

      const result = await getCorridorBySlug('xlm-usd', { fetchFn });
      assert.equal(result.status, 200);
      assert.equal(requestedUrl, 'http://localhost:3000/api/corridors/xlm-usd');
    });

    it('fetches rates with optional corridor filter', async () => {
      let requestedUrl = null;
      const mockPayload = { rates: [{ corridor: 'usdc-eur', rate: 0.92 }] };
      const fetchFn = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => mockPayload,
        };
      };

      const result = await getRates({ corridor: 'usdc-eur', fetchFn });
      assert.equal(result.status, 200);
      assert.equal(requestedUrl, 'http://localhost:3000/api/rates?corridor=usdc-eur');
    });

    it('fetches rate history with corridor and days filter', async () => {
      let requestedUrl = null;
      const mockPayload = { history: [{ timestamp: '2026-11-20T00:00:00Z', rate: 5.42 }] };
      const fetchFn = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => mockPayload,
        };
      };

      const result = await getRateHistory({ corridor: 'usdc-brl', days: 14, fetchFn });
      assert.equal(result.status, 200);
      assert.equal(requestedUrl, 'http://localhost:3000/api/rates/history?corridor=usdc-brl&days=14');
    });

    it('fetches reputation summary and single anchor reputation', async () => {
      const globalRepPayload = { reputations: [{ slug: 'stellar-anchor', score: 95 }] };
      const fetchGlobal = createMockFetch({ status: 200, body: globalRepPayload });
      const globalRes = await getReputation({ fetchFn: fetchGlobal });
      assert.equal(globalRes.status, 200);
      assert.deepEqual(globalRes.data, globalRepPayload);

      const singleRepPayload = { slug: 'stellar-anchor', score: 95, evidenceCount: 42 };
      const fetchSingle = createMockFetch({ status: 200, body: singleRepPayload });
      const singleRes = await getReputationBySlug('stellar-anchor', { fetchFn: fetchSingle });
      assert.equal(singleRes.status, 200);
      assert.deepEqual(singleRes.data, singleRepPayload);
    });
  });

  describe('Degraded & Nullable Evidence Handling', () => {
    it('detects x-stale-evidence header as degraded', async () => {
      const fetchFn = createMockFetch({
        status: 200,
        headers: { 'x-stale-evidence': 'true' },
        body: { rates: [] },
      });
      const result = await getRates({ fetchFn });
      assert.equal(result.degraded, true);
    });

    it('detects x-evidence-degraded header as degraded', async () => {
      const fetchFn = createMockFetch({
        status: 200,
        headers: { 'x-evidence-degraded': 'true' },
        body: { reputations: [] },
      });
      const result = await getReputation({ fetchFn });
      assert.equal(result.degraded, true);
    });

    it('honestly handles null median rate and empty history', async () => {
      const payload = {
        corridor: 'usdc-zar',
        medianRate: null,
        history: [],
        evidenceCount: 0,
      };
      const fetchFn = createMockFetch({ status: 200, body: payload });
      const result = await getRateHistory({ corridor: 'usdc-zar', fetchFn });

      assert.equal(result.data.medianRate, null);
      assert.equal(result.data.history.length, 0);
      assert.equal(result.data.evidenceCount, 0);
    });

    it('honestly handles unrated / null score reputation', async () => {
      const payload = {
        slug: 'new-anchor',
        score: null,
        tier: 'unrated',
        evidenceCount: 0,
      };
      const fetchFn = createMockFetch({ status: 200, body: payload });
      const result = await getReputationBySlug('new-anchor', { fetchFn });

      assert.equal(result.data.score, null);
      assert.equal(result.data.tier, 'unrated');
      assert.equal(result.data.evidenceCount, 0);
    });
  });

  describe('Error Handling (4xx, 5xx, 429, Transport)', () => {
    it('handles 400 Bad Request error cleanly', async () => {
      const errorPayload = { error: { message: 'Invalid query parameters', code: 'INVALID_PARAMS' } };
      const fetchFn = createMockFetch({ status: 400, statusText: 'Bad Request', body: errorPayload });

      await assert.rejects(
        async () => getRates({ corridor: 'valid-slug', fetchFn }),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, 400);
          assert.equal(err.code, 'INVALID_PARAMS');
          assert.match(err.message, /Invalid query parameters/);
          return true;
        },
      );
    });

    it('handles 404 Not Found error cleanly', async () => {
      const errorPayload = { error: { message: 'Anchor not found', code: 'NOT_FOUND' } };
      const fetchFn = createMockFetch({ status: 404, statusText: 'Not Found', body: errorPayload });

      await assert.rejects(
        async () => getAnchorBySlug('unknown-anchor', { fetchFn }),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, 404);
          assert.equal(err.code, 'NOT_FOUND');
          return true;
        },
      );
    });

    it('handles 429 Rate Limit and extracts Retry-After header', async () => {
      const errorPayload = { error: { message: 'Too many requests' } };
      const fetchFn = createMockFetch({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '60' },
        body: errorPayload,
      });

      await assert.rejects(
        async () => getAnchors({ fetchFn }),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, 429);
          assert.equal(err.code, 'RATE_LIMITED');
          assert.match(err.message, /Retry after: 60s/);
          return true;
        },
      );
    });

    it('handles 500 Internal Server Error cleanly', async () => {
      const errorPayload = { error: { message: 'Database connection failed', code: 'INTERNAL_ERROR' } };
      const fetchFn = createMockFetch({ status: 500, statusText: 'Internal Server Error', body: errorPayload });

      await assert.rejects(
        async () => getCorridors({ fetchFn }),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, 500);
          assert.equal(err.code, 'INTERNAL_ERROR');
          return true;
        },
      );
    });

    it('handles transport failure (network rejection)', async () => {
      const fetchFn = async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:3000');
      };

      await assert.rejects(
        async () => safePublicGet('/api/anchors', { fetchFn }),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, 0);
          assert.equal(err.code, 'TRANSPORT_ERROR');
          assert.match(err.message, /Transport failure connecting/);
          return true;
        },
      );
    });

    it('handles invalid non-JSON body when content-type claims JSON', async () => {
      const fetchFn = async () => ({
        ok: true,
        status: 200,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      await assert.rejects(
        async () => safePublicGet('/api/anchors', { fetchFn }),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.code, 'INVALID_JSON');
          return true;
        },
      );
    });
  });
});
