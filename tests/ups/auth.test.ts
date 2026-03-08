import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import nock from 'nock';
import { UpsAuthClient } from '../../src/carriers/ups/ups.auth.js';
import { CarrierError } from '../../src/core/errors.js';

const AUTH_ORIGIN = 'https://wwwcie.ups.com';
const AUTH_PATH = '/security/v1/oauth/token';

const makeClient = () =>
  new UpsAuthClient({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    authUrl: `${AUTH_ORIGIN}${AUTH_PATH}`,
  });

const tokenPayload = (accessToken = 'test-token', expiresIn = '14399') => ({
  access_token: accessToken,
  token_type: 'Bearer',
  issued_at: String(Date.now()),
  expires_in: expiresIn,
  status: 'approved',
});

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());
beforeEach(() => nock.cleanAll());

describe('UpsAuthClient — token acquisition', () => {
  it('fetches a token from the UPS auth endpoint', async () => {
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(200, tokenPayload('my-token'));

    const token = await makeClient().getToken();

    expect(token).toBe('my-token');
  });

  it('sends Basic auth header with base64-encoded credentials', async () => {
    const expectedAuth = `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`;

    nock(AUTH_ORIGIN)
      .post(AUTH_PATH)
      .matchHeader('Authorization', expectedAuth)
      .reply(200, tokenPayload());

    await expect(makeClient().getToken()).resolves.toBeDefined();
  });

  it('sends the correct grant_type in the body', async () => {
    nock(AUTH_ORIGIN)
      .post(AUTH_PATH, 'grant_type=client_credentials')
      .reply(200, tokenPayload());

    await expect(makeClient().getToken()).resolves.toBeDefined();
  });
});

describe('UpsAuthClient — token caching', () => {
  it('reuses a cached token on subsequent calls', async () => {
    // Register only one interceptor — a second HTTP call would throw "Nock: No match"
    nock(AUTH_ORIGIN).post(AUTH_PATH).once().reply(200, tokenPayload('cached-token'));

    const client = makeClient();
    const t1 = await client.getToken();
    const t2 = await client.getToken();

    expect(t1).toBe('cached-token');
    expect(t2).toBe('cached-token');
    expect(nock.isDone()).toBe(true); // exactly one HTTP call
  });

  it('refreshes the token after it has expired', async () => {
    // First token issued far in the past so it is immediately expired
    const pastTimestamp = String(Date.now() - 86_400_000); // 24 h ago
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(200, {
      access_token: 'expired-token',
      token_type: 'Bearer',
      issued_at: pastTimestamp,
      expires_in: '1', // 1 second TTL
      status: 'approved',
    });
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(200, tokenPayload('fresh-token'));

    const client = makeClient();
    await client.getToken();          // primes cache with expired-token
    const result = await client.getToken(); // should detect expiry and refresh

    expect(result).toBe('fresh-token');
    expect(nock.isDone()).toBe(true);
  });
});

describe('UpsAuthClient — error handling', () => {
  it('throws CarrierError AUTH_FAILED on 401', async () => {
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(401, { message: 'Unauthorized' });

    await expect(makeClient().getToken()).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      carrier: 'UPS',
      httpStatus: 401,
    });
  });

  it('throws CarrierError AUTH_FAILED on 403', async () => {
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(403, { message: 'Forbidden' });

    await expect(makeClient().getToken()).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      carrier: 'UPS',
      httpStatus: 403,
    });
  });

  it('throws CarrierError AUTH_REFRESH_FAILED on 500', async () => {
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(500, { message: 'Internal Server Error' });

    await expect(makeClient().getToken()).rejects.toMatchObject({
      code: 'AUTH_REFRESH_FAILED',
      carrier: 'UPS',
    });
  });

  it('throws CarrierError AUTH_REFRESH_FAILED on network error', async () => {
    nock(AUTH_ORIGIN).post(AUTH_PATH).replyWithError('connect ECONNREFUSED');

    await expect(makeClient().getToken()).rejects.toMatchObject({
      code: 'AUTH_REFRESH_FAILED',
      carrier: 'UPS',
    });
  });

  it('errors are instances of CarrierError', async () => {
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(401, {});

    const err = await makeClient().getToken().catch(e => e);

    expect(err).toBeInstanceOf(CarrierError);
  });

  it('clears the token cache after a failed refresh so the next call retries', async () => {
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(500, {});
    nock(AUTH_ORIGIN).post(AUTH_PATH).reply(200, tokenPayload('retry-token'));

    const client = makeClient();
    await client.getToken().catch(() => null); // first call fails
    const token = await client.getToken();     // second call should retry

    expect(token).toBe('retry-token');
  });
});
