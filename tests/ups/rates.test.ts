import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import nock from 'nock';
import { UpsRatesOperation } from '../../src/carriers/ups/ups.rates.js';
import { UpsCarrier } from '../../src/carriers/ups/ups.carrier.js';
import { UpsAuthClient } from '../../src/carriers/ups/ups.auth.js';
import { HttpClient } from '../../src/core/http-client.js';
import { RateRequest } from '../../src/core/types.js';

const UPS_ORIGIN = 'https://onlinetools.ups.com';
const AUTH_ORIGIN = 'https://wwwcie.ups.com';
const AUTH_PATH = '/security/v1/oauth/token';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const stubAuth = (token = 'test-bearer') =>
  nock(AUTH_ORIGIN).post(AUTH_PATH).reply(200, {
    access_token: token,
    token_type: 'Bearer',
    issued_at: String(Date.now()),
    expires_in: '14399',
    status: 'approved',
  });

const makeRatesOp = () => {
  const auth = new UpsAuthClient({
    clientId: 'id',
    clientSecret: 'secret',
    authUrl: `${AUTH_ORIGIN}${AUTH_PATH}`,
  });
  const http = new HttpClient('UPS', 5_000);
  return new UpsRatesOperation(auth, http, { baseUrl: UPS_ORIGIN });
};

const makeCarrier = () =>
  new UpsCarrier({
    auth: { clientId: 'id', clientSecret: 'secret', authUrl: `${AUTH_ORIGIN}${AUTH_PATH}` },
    baseUrl: UPS_ORIGIN,
    timeoutMs: 5_000,
  });

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_REQUEST: RateRequest = {
  origin: {
    name: 'ACME Corp',
    street1: '123 Main St',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30301',
    countryCode: 'US',
  },
  destination: {
    name: 'Jane Doe',
    street1: '456 Oak Ave',
    city: 'Dallas',
    state: 'TX',
    postalCode: '75201',
    countryCode: 'US',
  },
  packages: [{ weightLbs: 5, lengthIn: 10, widthIn: 8, heightIn: 6 }],
};

// Realistic UPS "Shop" response (multiple services)
const SHOP_RESPONSE = {
  RateResponse: {
    Response: { ResponseStatus: { Code: '1', Description: 'Success' } },
    RatedShipment: [
      {
        Service: { Code: '03' },
        TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '12.34' },
        BillingWeight: { Weight: '5.0', UnitOfMeasurement: { Code: 'LBS' } },
        GuaranteedDelivery: { BusinessDaysInTransit: '3' },
      },
      {
        Service: { Code: '02' },
        TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '24.00' },
        BillingWeight: { Weight: '5.0', UnitOfMeasurement: { Code: 'LBS' } },
        GuaranteedDelivery: { BusinessDaysInTransit: '2' },
      },
      {
        Service: { Code: '01' },
        TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '45.00' },
        BillingWeight: { Weight: '5.0', UnitOfMeasurement: { Code: 'LBS' } },
        GuaranteedDelivery: { BusinessDaysInTransit: '1' },
      },
    ],
  },
};

// UPS "Rate" response — single service (note: object, not array)
const RATE_RESPONSE = {
  RateResponse: {
    Response: { ResponseStatus: { Code: '1', Description: 'Success' } },
    RatedShipment: {
      Service: { Code: '03' },
      TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '12.34' },
      BillingWeight: { Weight: '5.0', UnitOfMeasurement: { Code: 'LBS' } },
      GuaranteedDelivery: { BusinessDaysInTransit: '3' },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());
beforeEach(() => nock.cleanAll());

// ─── Request building ─────────────────────────────────────────────────────────

describe('request building', () => {
  it('sends a Shop request when no serviceCode is provided', async () => {
    stubAuth();
    let capturedBody: Record<string, unknown> = {};

    nock(UPS_ORIGIN)
      .post('/api/rating/v2205/Shop', body => {
        capturedBody = body as Record<string, unknown>;
        return true;
      })
      .reply(200, SHOP_RESPONSE);

    await makeRatesOp().getRates(SAMPLE_REQUEST);

    const req = (capturedBody as any).RateRequest;
    expect(req.Request.RequestOption).toBe('Shop');
  });

  it('sends a Rate request and includes Service.Code when serviceCode is provided', async () => {
    stubAuth();
    let capturedBody: Record<string, unknown> = {};

    nock(UPS_ORIGIN)
      .post('/api/rating/v2205/Rate', body => {
        capturedBody = body as Record<string, unknown>;
        return true;
      })
      .reply(200, RATE_RESPONSE);

    await makeRatesOp().getRates({ ...SAMPLE_REQUEST, serviceCode: '03' });

    const req = (capturedBody as any).RateRequest;
    expect(req.Request.RequestOption).toBe('Rate');
    expect(req.Shipment.Service.Code).toBe('03');
  });

  it('maps package dimensions and weight to UPS string format', async () => {
    stubAuth();
    let capturedBody: Record<string, unknown> = {};

    nock(UPS_ORIGIN)
      .post('/api/rating/v2205/Shop', body => {
        capturedBody = body as Record<string, unknown>;
        return true;
      })
      .reply(200, SHOP_RESPONSE);

    await makeRatesOp().getRates(SAMPLE_REQUEST);

    const pkg = (capturedBody as any).RateRequest.Shipment.Package[0];
    expect(pkg.Dimensions.Length).toBe('10');
    expect(pkg.Dimensions.Width).toBe('8');
    expect(pkg.Dimensions.Height).toBe('6');
    expect(pkg.Dimensions.UnitOfMeasurement.Code).toBe('IN');
    expect(pkg.PackageWeight.Weight).toBe('5');
    expect(pkg.PackageWeight.UnitOfMeasurement.Code).toBe('LBS');
  });

  it('maps origin and destination addresses correctly', async () => {
    stubAuth();
    let capturedBody: Record<string, unknown> = {};

    nock(UPS_ORIGIN)
      .post('/api/rating/v2205/Shop', body => {
        capturedBody = body as Record<string, unknown>;
        return true;
      })
      .reply(200, SHOP_RESPONSE);

    await makeRatesOp().getRates(SAMPLE_REQUEST);

    const shipment = (capturedBody as any).RateRequest.Shipment;
    expect(shipment.ShipTo.Address.City).toBe('Dallas');
    expect(shipment.ShipTo.Address.PostalCode).toBe('75201');
    expect(shipment.Shipper.Address.City).toBe('Atlanta');
  });

  it('sends a Bearer token in the Authorization header', async () => {
    stubAuth('super-secret-token');

    nock(UPS_ORIGIN)
      .post('/api/rating/v2205/Shop')
      .matchHeader('Authorization', 'Bearer super-secret-token')
      .reply(200, SHOP_RESPONSE);

    await expect(makeRatesOp().getRates(SAMPLE_REQUEST)).resolves.toBeDefined();
  });
});

// ─── Response parsing ─────────────────────────────────────────────────────────

describe('response parsing', () => {
  it('normalizes a multi-service Shop response into RateQuote[]', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Shop').reply(200, SHOP_RESPONSE);

    const quotes = await makeRatesOp().getRates(SAMPLE_REQUEST);

    expect(quotes).toHaveLength(3);
    expect(quotes[0]).toMatchObject({
      carrier: 'UPS',
      serviceCode: '03',
      serviceName: 'UPS Ground',
      totalCharge: 12.34,
      currency: 'USD',
      estimatedTransitDays: 3,
      billingWeightLbs: 5,
    });
    expect(quotes[1]).toMatchObject({ serviceCode: '02', serviceName: 'UPS 2nd Day Air', totalCharge: 24 });
    expect(quotes[2]).toMatchObject({ serviceCode: '01', serviceName: 'UPS Next Day Air', totalCharge: 45 });
  });

  it('normalizes a single-service Rate response (non-array RatedShipment)', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Rate').reply(200, RATE_RESPONSE);

    const quotes = await makeRatesOp().getRates({ ...SAMPLE_REQUEST, serviceCode: '03' });

    expect(quotes).toHaveLength(1);
    expect(quotes[0].serviceCode).toBe('03');
    expect(quotes[0].totalCharge).toBe(12.34);
  });

  it('resolves unknown service codes with a fallback name', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Rate').reply(200, {
      RateResponse: {
        Response: { ResponseStatus: { Code: '1', Description: 'Success' } },
        RatedShipment: {
          Service: { Code: '99' }, // unknown code
          TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '10.00' },
        },
      },
    });

    const quotes = await makeRatesOp().getRates({ ...SAMPLE_REQUEST, serviceCode: '99' });

    expect(quotes[0].serviceName).toBe('UPS Service 99');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('throws UPSTREAM_ERROR with UPS error message on 400', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Shop').reply(400, {
      response: { errors: [{ code: '111210', message: 'Missing or invalid shipper number.' }] },
    });

    const err = await makeRatesOp().getRates(SAMPLE_REQUEST).catch(e => e);
    expect(err.code).toBe('UPSTREAM_ERROR');
    expect(err.httpStatus).toBe(400);
    expect(err.message).toContain('111210');
  });

  it('throws AUTH_FAILED on 401 from the rating endpoint', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Shop').reply(401, {});

    await expect(makeRatesOp().getRates(SAMPLE_REQUEST)).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      httpStatus: 401,
    });
  });

  it('throws RATE_LIMIT_EXCEEDED on 429', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Shop').reply(429, {});

    await expect(makeRatesOp().getRates(SAMPLE_REQUEST)).rejects.toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      httpStatus: 429,
    });
  });

  it('throws UPSTREAM_ERROR on 500', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Shop').reply(500, {});

    await expect(makeRatesOp().getRates(SAMPLE_REQUEST)).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    });
  });

  it('throws NETWORK_TIMEOUT on network-level error', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Shop').replyWithError('connect ECONNREFUSED 127.0.0.1:443');

    await expect(makeRatesOp().getRates(SAMPLE_REQUEST)).rejects.toMatchObject({
      code: 'NETWORK_TIMEOUT',
    });
  });

  it('throws MALFORMED_RESPONSE when RateResponse field is absent', async () => {
    stubAuth();
    nock(UPS_ORIGIN).post('/api/rating/v2205/Shop').reply(200, { unexpected: 'payload' });

    await expect(makeRatesOp().getRates(SAMPLE_REQUEST)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('throws MALFORMED_RESPONSE on non-JSON 200 response', async () => {
    stubAuth();
    nock(UPS_ORIGIN)
      .post('/api/rating/v2205/Shop')
      .reply(200, '<html>error page</html>', { 'content-type': 'text/html' });

    // axios will parse as string, causing our shape check to fail
    await expect(makeRatesOp().getRates(SAMPLE_REQUEST)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('input validation (UpsCarrier)', () => {
  it('throws INVALID_REQUEST without hitting the network when origin city is missing', async () => {
    const carrier = makeCarrier();
    const badRequest = {
      ...SAMPLE_REQUEST,
      origin: { ...SAMPLE_REQUEST.origin, city: '' },
    };

    await expect(carrier.getRates(badRequest)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      carrier: 'UPS',
    });

    // No nock interceptors were registered, so if any HTTP call had been made,
    // nock would throw "Nock: No match for request" — proving validation fired first.
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('throws INVALID_REQUEST when packages array is empty', async () => {
    const carrier = makeCarrier();

    await expect(carrier.getRates({ ...SAMPLE_REQUEST, packages: [] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('throws INVALID_REQUEST when a package has non-positive weight', async () => {
    const carrier = makeCarrier();
    const badRequest = {
      ...SAMPLE_REQUEST,
      packages: [{ weightLbs: -1, lengthIn: 10, widthIn: 8, heightIn: 6 }],
    };

    await expect(carrier.getRates(badRequest)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });
});
