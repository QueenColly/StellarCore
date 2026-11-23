
# Public API Error Troubleshooting

This guide explains how API consumers should interpret StellarCore's public
API errors, handle rate limiting, and report failed requests safely.

StellarCore's public API is read-only. Its error responses describe failures
while retrieving or validating persisted evidence. They do not indicate that
a transfer was attempted, completed, or settled.

For complete endpoint contracts and response examples, see the
[Public API Reference](api-reference.md).

## 1. Standard error response

The current public API error envelope is:

```json
{
  "error": {
    "code": "snake_case_code",
    "message": "Human-readable message."
  }
}
```

The fields have different purposes:

| Field | Purpose | Recommended use |
| --- | --- | --- |
| `error.code` | Machine-readable error identifier | Use it to select application handling and diagnostics |
| `error.message` | Human-readable explanation | Display a safe explanation or record it with the error code |

The `code` identifies the error category. The `message` provides context for
a person reading the response.

Use the HTTP status and `error.code` to determine how to handle a failure.
Do not make application logic depend on the exact wording of `message`.

The shared response implementation is defined in:

- [`types/api/errors.ts`](../types/api/errors.ts) — error codes and status
  mappings.
- [`lib/api/errors.ts`](../lib/api/errors.ts) — error envelope and result
  construction.
- [`lib/api/http.ts`](../lib/api/http.ts) — JSON response and error response
  helpers.
- [`docs/api-reference.md`](api-reference.md) — endpoint-specific examples.

## 2. Understanding common error statuses

The following table describes the main public API error categories.

| HTTP status | Common error code | Meaning | Recommended action |
| --- | --- | --- | --- |
| `400 Bad Request` | `missing_corridor`, `invalid_corridor`, `invalid_days`, `invalid_anchor_slug`, `invalid_corridor_slug`, `invalid_pagination`, `invalid_query` | The request contains a missing, malformed, or unsupported parameter | Correct the request before retrying |
| `404 Not Found` | `anchor_not_found`, `corridor_not_found` | The supplied, syntactically valid resource identifier does not match a persisted resource | Check the slug and confirm that the resource exists |
| `429 Too Many Requests` | `rate_limited` | The client has exceeded the configured request budget | Stop rapid retries and retry later with bounded backoff |
| `500 Internal Server Error` | `internal_error` | StellarCore could not complete the requested operation | Retry cautiously if appropriate; report a persistent failure |

The exact error codes and messages depend on the endpoint. Consult the
[Public API Reference](api-reference.md) rather than assuming every route
supports every error code.

A successful HTTP response can also contain an evidence state such as
`insufficient_fresh_sources`. That is not an API error. It means the requested
data was returned, but the evidence requirement for publishing a median was
not met.

## 3. Request IDs and correlation headers

### Current implementation limitation

The current public API error envelope contains only:

- `error.code`
- `error.message`

It does **not** currently contain an `error.requestId` field.

The current public API response helpers also do **not** generate or return an
`X-Request-Id` response header. A caller-provided request ID is not documented
as a supported correlation mechanism.

This means an API consumer cannot currently use a response request ID to
look up a matching server-side log entry.

Do not assume that either of the following is available:

```json
{
  "error": {
    "code": "internal_error",
    "message": "Unable to load anchors.",
    "requestId": "..."
  }
}
```

```http
X-Request-Id: ...
```

These examples illustrate fields that are **not part of the current
implementation**. They are not valid examples of a current StellarCore
response.

### What to provide when no request ID is available

When reporting a failed request, provide the information that the current
implementation actually exposes:

1. Request date and time in UTC.
2. HTTP method and public endpoint path.
3. HTTP response status.
4. `error.code`, when an error body is returned.
5. `error.message`, when an error body is returned.
6. A short description of the expected and observed behavior.
7. Sanitized request parameters that are necessary to reproduce the issue.

For example:

```text
Timestamp (UTC): 2026-11-21T12:30:00Z
Method: GET
Path: /api/anchors/unknown-anchor
HTTP status: 404
Error code: anchor_not_found
Error message: Anchor not found.
```

This is a safe diagnostic summary. It is not a request-ID correlation record.

If a maintainer needs server-side diagnostics, provide the summary through
the project's appropriate reporting channel and let an authorized operator
correlate it with server-side records.

## 4. How public error messages are handled

The API response helpers construct bounded error envelopes. For unexpected
errors, the public response uses a generic message rather than returning the
underlying exception text.

For example, an unexpected anchor-directory read failure can return:

```json
{
  "error": {
    "code": "internal_error",
    "message": "Unable to load anchors."
  }
}
```

The public response is not intended to expose:

- Database connection strings.
- Database credentials.
- Authentication tokens.
- Private keys or wallet secrets.
- Raw stack traces.
- Internal exception details.
- Server environment variables.

### Public response sanitization is not log sanitization

The server-side error reporter can receive and log the original exception
object. A generic public error message does not prove that internal logs are
sanitized.

Do not copy raw server logs into a public issue or pull request. Review and
redact diagnostic material before sharing it, and use an appropriate
restricted channel for sensitive operational information.

Never include the following in a public report:

- `DATABASE_URL` or database credentials.
- `CRON_SECRET` or bearer tokens.
- Authorization headers or cookies.
- Stellar secret seeds, private keys, or wallet recovery phrases.
- Unredacted environment variables.
- Customer information or unrelated personal data.
- Raw exception output that may contain secrets or infrastructure details.

## 5. Handling HTTP 429 rate limiting

The public API applies a shared in-memory fixed-window rate limiter to its
eight public GET routes:

- `GET /api/anchors`
- `GET /api/anchors/{slug}`
- `GET /api/corridors`
- `GET /api/corridors/{slug}`
- `GET /api/rates`
- `GET /api/rates/history`
- `GET /api/reputation`
- `GET /api/reputation/{slug}`

The current configured limit is **100 requests per minute per client IP per
serverless instance**.

The implementation uses:

- A fixed window of 60,000 milliseconds.
- An in-memory counter shared by the public routes within a process instance.
- The first value in `x-forwarded-for` as the preferred client IP.
- `x-real-ip` as a fallback.
- `anonymous` as the final fallback when neither header supplies an IP.

The limit is per instance, not a globally coordinated quota across all
serverless instances.

### Example 429 response

```http
HTTP/1.1 429 Too Many Requests
Cache-Control: no-store
Content-Type: application/json
```

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many requests. Please try again later."
  }
}
```

### Retry behavior

The current 429 response does **not** include:

- `Retry-After`
- `X-RateLimit-Reset`
- A request ID or `X-Request-Id` header.

Therefore, a client cannot calculate an exact retry time from a response
header.

When a client receives `429`:

1. Stop immediate or repeated automatic retries.
2. Wait before sending another request.
3. Use bounded exponential backoff with random jitter when retrying
   automatically.
4. Keep retry attempts limited.
5. Avoid retrying all failed requests at the same time across multiple clients.
6. Return a clear temporary-unavailability message to the user if the
   retry budget is exhausted.

A delay approaching the 60-second window is a conservative starting point,
but it is not a server-provided reset instruction. The implementation does
not expose an exact reset timestamp.

Do not repeatedly retry `400` or `404` responses without correcting the
request. Those responses normally require a change to the supplied input.

### Example client-side handling

The following JavaScript illustrates how to inspect the current error
envelope. The retry policy should be implemented separately and bounded.

```javascript
async function requestJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const code = payload?.error?.code ?? "unknown_error";
    const message = payload?.error?.message ?? "Request failed.";

    if (response.status === 429) {
      // Stop rapid retries.
      // Retry later using bounded backoff and jitter.
    }

    throw new Error(`${code}: ${message}`);
  }

  return payload;
}
```

This example reads only fields present in the current response contract. It
does not assume a request ID or retry header.

## 6. Troubleshooting a failed request

Use the following steps before reporting an API problem.

### Step 1: Check the HTTP status

Inspect the response status before treating the request as successful.

For example:

```bash
curl -i "https://your-stellarcore-host/api/anchors/unknown-anchor"
```

Replace the host with the deployed StellarCore host you are testing.

### Step 2: Read the error code

If the response contains an `error` object, record its `code` and `message`.

Use the code for programmatic handling. Treat the message as explanatory
text, not as a stable machine-readable identifier.

### Step 3: Check the request

Confirm that:

- The endpoint path is correct.
- The HTTP method is supported.
- Required query parameters are present.
- Slugs use the documented format.
- Numeric parameters are within the documented range.
- The requested anchor or corridor is expected to exist.

All documented public integration endpoints are GET-only.

### Step 4: Handle rate limiting separately

If the response is `429`, reduce request frequency and use the bounded
backoff guidance above.

Do not interpret a rate-limit response as proof that the requested anchor,
corridor, rate source, or transfer service is unavailable.

### Step 5: Check whether the problem persists

Retry only when the failure may be temporary and the retry is safe.

For persistent failures, prepare a sanitized diagnostic summary.

## 7. Reporting an API problem safely

A useful report should contain:

| Information | Include? | Guidance |
| --- | --- | --- |
| UTC timestamp | Yes | Include the approximate time of the failed request |
| HTTP method and route | Yes | Include the public endpoint path |
| HTTP status | Yes | Include the returned status code |
| Error code and message | Yes | Copy the public error envelope fields |
| Expected behavior | Yes | Explain what you expected to happen |
| Observed behavior | Yes | Explain what actually happened |
| Sanitized query parameters | When relevant | Include only what is necessary to reproduce the request |
| Request ID | No, unless a future implementation provides one | The current public API does not return one |
| Authorization headers and credentials | Never | Remove secrets before sharing |
| Raw server logs | Never in public reports | Use an authorized restricted channel if requested by maintainers |

### Example report

```text
Title: Public anchors endpoint returns an unexpected error

Timestamp (UTC):
2026-11-21T12:30:00Z

Request:
GET /api/anchors

HTTP status:
500

Error code:
internal_error

Error message:
Unable to load anchors.

Expected behavior:
The endpoint should return the persisted anchor directory.

Observed behavior:
The endpoint returned an internal server error.

Reproduction:
The issue occurred when requesting the public anchors endpoint.
```

Do not add invented request IDs, credentials, raw logs, or unrelated personal
information to the report.

## 8. Implementation references

The behavior described in this guide was checked against:

- [`types/api/errors.ts`](../types/api/errors.ts) — public error codes and
  HTTP status mapping.
- [`lib/api/errors.ts`](../lib/api/errors.ts) — public error envelope and
  server-side error reporter.
- [`lib/api/http.ts`](../lib/api/http.ts) — JSON response, error response,
  and generic unexpected-error handling.
- [`lib/api/rateLimiter.ts`](../lib/api/rateLimiter.ts) — fixed-window
  rate limiting and the 429 response.
- [`lib/api/requestHandlers.ts`](../lib/api/requestHandlers.ts) — rate-limit
  enforcement for delegated public routes.
- [`app/api/anchors/[slug]/route.ts`](../app/api/anchors/%5Bslug%5D/route.ts)
  and [`app/api/corridors/[slug]/route.ts`](../app/api/corridors/%5Bslug%5D/route.ts) —
  direct public detail-route handling.
- [`docs/api-reference.md`](api-reference.md) — endpoint response contracts,
  validation behavior, and rate limiting.
- [`docs/privacy-custody-boundaries.md`](privacy-custody-boundaries.md) —
  safe handling of sensitive information.

## 9. Known limitation

Request-ID correlation is not currently implemented by the public API.

Adding it would require an application change that generates or validates a
request identifier, propagates it consistently through public responses
(including rate-limit responses), and defines the corresponding response
header and logging behavior.

Such a change would also require tests and a reviewed public API compatibility
update. This documentation does not claim that functionality exists.

Until that work is implemented, use the UTC timestamp, endpoint, HTTP status,
and public error code as the available diagnostic context.
