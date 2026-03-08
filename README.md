# Carrier Integration Service

A TypeScript service that integrates with shipping carriers to fetch real-time rate quotes. Currently implements UPS via the [UPS Rating API](https://developer.ups.com/tag/Rating?loc=en_US).

---

## Design Decisions

### Extensible Architecture

Adding a second carrier (FedEx, USPS) never requires touching existing code. The design is based on three principles:

1. **`ICarrier` interface** (`src/core/carrier.interface.ts`) — every carrier implements this contract. Consumers program against the interface, not a concrete class.
2. **Per-carrier modules** (`src/carriers/<carrier>/`) — all UPS logic lives in its own directory. FedEx gets its own directory. Zero shared mutable state between carriers.
3. **Per-operation classes** (`ups.rates.ts`, future `ups.label.ts`, `ups.tracking.ts`) — adding a new UPS operation means adding a new class and calling it from `UpsCarrier`. No existing operation code changes.

### Layer Separation

```
ICarrier (interface)
  └── UpsCarrier           — public API + input validation
        ├── UpsAuthClient  — OAuth2 token lifecycle (cache + refresh)
        ├── HttpClient     — axios wrapper, normalizes all errors to CarrierError
        └── UpsRatesOperation
              ├── ups.mapper.ts  — internal ↔ UPS raw types
              └── ups.types.ts   — UPS-specific API shapes (never exposed)
```

Callers only import from `src/index.ts` and see the normalized `RateQuote[]` type — UPS-specific shapes are fully encapsulated.

### Authentication

`UpsAuthClient` implements the [UPS OAuth 2.0 client-credentials flow](https://developer.ups.com/api/reference/oauth/authorization-code):

- Tokens are cached in memory until expiry.
- A 60-second buffer prevents using tokens at the edge of their TTL.
- On any fetch failure the cache is cleared so the next call retries.
- Auth is transparent to callers — `UpsRatesOperation` calls `auth.getToken()` automatically.

### Error Handling

All errors surface as `CarrierError` with a typed `code` field:

| Code | When |
|---|---|
| `AUTH_FAILED` | 401/403 on the auth endpoint |
| `AUTH_REFRESH_FAILED` | Token fetch failed (network, 5xx) |
| `INVALID_REQUEST` | Zod validation failed before any HTTP call |
| `RATE_LIMIT_EXCEEDED` | 429 from any endpoint |
| `UPSTREAM_ERROR` | 4xx/5xx other than auth |
| `NETWORK_TIMEOUT` | No HTTP response (timeout, ECONNREFUSED, etc.) |
| `MALFORMED_RESPONSE` | Response shape doesn't match expected structure |

No exceptions are swallowed — every error path terminates in a `CarrierError`.

### Validation

[Zod](https://zod.dev) schemas live alongside the domain types in `src/core/types.ts`. Validation runs in `UpsCarrier.getRates()` before any network call is made, ensuring the UPS API never receives malformed requests.

---

## Project Structure

```
src/
  config.ts                     # Env var loading + Zod validation
  index.ts                      # Public API exports
  core/
    carrier.interface.ts         # ICarrier contract
    errors.ts                    # CarrierError + error codes
    http-client.ts               # Axios wrapper with error normalization
    types.ts                     # Normalized domain types (Address, Package, RateRequest, RateQuote)
  carriers/
    ups/
      ups.auth.ts                # OAuth2 token lifecycle
      ups.carrier.ts             # ICarrier implementation, wires everything together
      ups.mapper.ts              # Internal ↔ UPS raw type conversion
      ups.rates.ts               # Rate Shopping operation
      ups.types.ts               # Raw UPS API shapes (private to this module)
tests/
  ups/
    auth.test.ts                 # Token acquisition, caching, refresh, error paths
    rates.test.ts                # Request building, response parsing, error paths, validation
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Install

```bash
pnpm install
```

### Configure

```bash
cp .env.example .env
# Fill in UPS_CLIENT_ID and UPS_CLIENT_SECRET
```

### Run Tests

```bash
pnpm test
```

Tests run fully offline — all HTTP calls are intercepted by [nock](https://github.com/nock/nock).

### Type Check

```bash
pnpm typecheck
```

### Build

```bash
pnpm build
# Output: dist/
```

### Usage Example

```typescript
import { UpsCarrier, loadConfig } from './src/index.js';

const config = loadConfig();

const ups = new UpsCarrier({
  auth: {
    clientId: config.UPS_CLIENT_ID,
    clientSecret: config.UPS_CLIENT_SECRET,
    authUrl: config.UPS_AUTH_URL,
  },
  baseUrl: config.UPS_BASE_URL,
  timeoutMs: config.HTTP_TIMEOUT_MS,
});

const quotes = await ups.getRates({
  origin: {
    street1: '123 Main St',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30301',
    countryCode: 'US',
  },
  destination: {
    street1: '456 Oak Ave',
    city: 'Dallas',
    state: 'TX',
    postalCode: '75201',
    countryCode: 'US',
  },
  packages: [{ weightLbs: 5, lengthIn: 10, widthIn: 8, heightIn: 6 }],
});

console.log(quotes);
// [
//   { carrier: 'UPS', serviceCode: '03', serviceName: 'UPS Ground', totalCharge: 12.34, currency: 'USD', ... },
//   { carrier: 'UPS', serviceCode: '02', serviceName: 'UPS 2nd Day Air', totalCharge: 24.00, ... },
//   ...
// ]
```

---

## What I Would Improve Given More Time

1. **Add a FedEx carrier** to demonstrate extensibility concretely and validate that `ICarrier` holds up across different auth patterns.
2. **Retry with exponential backoff** for transient errors (5xx, network timeouts) — would live in `HttpClient` so all carriers benefit automatically.
3. **Concurrent token refresh guard** — if two parallel requests detect an expired token simultaneously, both will attempt a refresh. A mutex/promise-dedup pattern would prevent duplicate token requests.
4. **Observability hooks** — structured logging and metric emission (request latency, error rates) as middleware in `HttpClient`.
5. **Request ID propagation** — thread a correlation ID from the caller down to the UPS `transId` header for end-to-end tracing.
6. **Rate request caching** — identical requests within a short TTL could be deduplicated to reduce API costs.
7. **Multi-package shipments** — the current implementation passes all packages in one UPS request (which UPS supports), but a more advanced implementation would handle UPS's per-package rate breakdown in the response.
