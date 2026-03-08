import axios from 'axios';
import { CarrierError } from '../../core/errors.js';

interface UpsTokenResponse {
  access_token: string;
  token_type: string;
  /** Unix timestamp in milliseconds (as string) when the token was issued */
  issued_at: string;
  /** Seconds until expiry (as string) */
  expires_in: string;
  status: string;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

// Proactively refresh this many ms before actual expiry to avoid race conditions
const EXPIRY_BUFFER_MS = 60_000;

export interface UpsAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
}

export class UpsAuthClient {
  private cached: CachedToken | null = null;

  constructor(private readonly config: UpsAuthConfig) {}

  /** Returns a valid bearer token, fetching or refreshing as needed. */
  async getToken(): Promise<string> {
    if (this.cached && !this.isExpired(this.cached)) {
      return this.cached.accessToken;
    }
    return this.fetchToken();
  }

  private isExpired(token: CachedToken): boolean {
    return Date.now() >= token.expiresAtMs - EXPIRY_BUFFER_MS;
  }

  private async fetchToken(): Promise<string> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    try {
      const response = await axios.post<UpsTokenResponse>(
        this.config.authUrl,
        'grant_type=client_credentials',
        {
          timeout: 10_000,
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { access_token, expires_in, issued_at } = response.data;

      // UPS returns issued_at as an ms-precision Unix timestamp string.
      // Fall back to Date.now() if parsing fails.
      const issuedAtMs = parseInt(issued_at, 10);
      const expiresInMs = parseInt(expires_in, 10) * 1000;
      const expiresAtMs = Number.isNaN(issuedAtMs)
        ? Date.now() + expiresInMs
        : issuedAtMs + expiresInMs;

      this.cached = { accessToken: access_token, expiresAtMs };
      return access_token;
    } catch (err) {
      // Clear cache on any failure so the next call retries
      this.cached = null;

      if (axios.isAxiosError(err)) {
        if (!err.response) {
          throw new CarrierError(
            'AUTH_REFRESH_FAILED',
            `UPS token fetch failed: ${err.message}`,
            'UPS',
            { cause: err },
          );
        }

        const status = err.response.status;
        if (status === 401 || status === 403) {
          throw new CarrierError(
            'AUTH_FAILED',
            'UPS authentication failed — check UPS_CLIENT_ID and UPS_CLIENT_SECRET',
            'UPS',
            { httpStatus: status, cause: err },
          );
        }

        throw new CarrierError(
          'AUTH_REFRESH_FAILED',
          `UPS token fetch failed: HTTP ${status}`,
          'UPS',
          { httpStatus: status, cause: err },
        );
      }

      throw new CarrierError('AUTH_REFRESH_FAILED', 'UPS token fetch failed', 'UPS', {
        cause: err,
      });
    }
  }
}
