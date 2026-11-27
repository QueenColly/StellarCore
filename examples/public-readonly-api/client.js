/**
 * Dependency-free HTTP client for StellarCore public read-only GET APIs.
 * Uses Node.js 22 built-in fetch.
 *
 * Guarantees:
 * - GET method only (no mutation, no credentials, no headers)
 * - Safe response status verification (200, 400, 404, 429, 5xx)
 * - Input validation for corridor slugs and history days
 * - Honest interpretation of nullable median, degraded status, and evidence
 */

const DEFAULT_BASE_URL = process.env.STELLARCORE_API_BASE_URL || 'http://localhost:3000';

class ApiError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function sanitizeBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return DEFAULT_BASE_URL;
  }
  return baseUrl.replace(/\/+$/, '');
}

function validateSlug(slug, paramName = 'slug') {
  if (!slug || typeof slug !== 'string') {
    throw new TypeError(`${paramName} must be a non-empty string`);
  }
  const trimmed = slug.trim();
  if (!/^[a-zA-Z0-9-_]+$/.test(trimmed)) {
    throw new TypeError(
      `${paramName} contains invalid characters; expected alphanumeric, dash, or underscore`,
    );
  }
  return trimmed;
}

function validateDays(days) {
  if (days === undefined || days === null) return undefined;
  const num = Number(days);
  if (!Number.isInteger(num) || num < 1 || num > 365) {
    throw new TypeError('days parameter must be an integer between 1 and 365');
  }
  return num;
}

async function safePublicGet(path, { baseUrl = DEFAULT_BASE_URL, fetchFn = fetch } = {}) {
  const url = `${sanitizeBaseUrl(baseUrl)}${path}`;

  let response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (err) {
    throw new ApiError(`Transport failure connecting to ${url}: ${err.message}`, {
      status: 0,
      code: 'TRANSPORT_ERROR',
    });
  }

  const isDegraded =
    response.headers?.get('x-stale-evidence') === 'true' ||
    response.headers?.get('x-evidence-degraded') === 'true';

  let body = null;
  const contentType = response.headers?.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch (parseErr) {
      throw new ApiError(`Failed to parse JSON response from ${url}: ${parseErr.message}`, {
        status: response.status,
        code: 'INVALID_JSON',
      });
    }
  }

  if (response.status === 429) {
    const retryAfter = response.headers?.get('retry-after');
    throw new ApiError(
      `Rate limit exceeded (429) on ${url}. Retry after: ${retryAfter || 'unspecified'}s`,
      {
        status: 429,
        code: 'RATE_LIMITED',
        data: body,
      },
    );
  }

  if (!response.ok) {
    const errorDetail = body?.error?.message || body?.message || response.statusText;
    const errorCode = body?.error?.code || `HTTP_${response.status}`;
    throw new ApiError(`API request failed with status ${response.status}: ${errorDetail}`, {
      status: response.status,
      code: errorCode,
      data: body,
    });
  }

  return {
    data: body,
    status: response.status,
    degraded: isDegraded,
  };
}

async function getAnchors({ limit, page, baseUrl, fetchFn } = {}) {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (page !== undefined) params.set('page', String(page));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return safePublicGet(`/api/anchors${qs}`, { baseUrl, fetchFn });
}

async function getAnchorBySlug(slug, { baseUrl, fetchFn } = {}) {
  const validSlug = validateSlug(slug, 'anchor slug');
  return safePublicGet(`/api/anchors/${encodeURIComponent(validSlug)}`, { baseUrl, fetchFn });
}

async function getCorridors({ limit, page, baseUrl, fetchFn } = {}) {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (page !== undefined) params.set('page', String(page));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return safePublicGet(`/api/corridors${qs}`, { baseUrl, fetchFn });
}

async function getCorridorBySlug(slug, { baseUrl, fetchFn } = {}) {
  const validSlug = validateSlug(slug, 'corridor slug');
  return safePublicGet(`/api/corridors/${encodeURIComponent(validSlug)}`, { baseUrl, fetchFn });
}

async function getRates({ corridor, baseUrl, fetchFn } = {}) {
  const params = new URLSearchParams();
  if (corridor) {
    validateSlug(corridor, 'corridor');
    params.set('corridor', corridor);
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  return safePublicGet(`/api/rates${qs}`, { baseUrl, fetchFn });
}

async function getRateHistory({ corridor, days, baseUrl, fetchFn } = {}) {
  const params = new URLSearchParams();
  if (corridor) {
    validateSlug(corridor, 'corridor');
    params.set('corridor', corridor);
  }
  if (days !== undefined) {
    validateDays(days);
    params.set('days', String(days));
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  return safePublicGet(`/api/rates/history${qs}`, { baseUrl, fetchFn });
}

async function getReputation({ baseUrl, fetchFn } = {}) {
  return safePublicGet('/api/reputation', { baseUrl, fetchFn });
}

async function getReputationBySlug(slug, { baseUrl, fetchFn } = {}) {
  const validSlug = validateSlug(slug, 'anchor slug');
  return safePublicGet(`/api/reputation/${encodeURIComponent(validSlug)}`, { baseUrl, fetchFn });
}

export {
  ApiError,
  DEFAULT_BASE_URL,
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
};
