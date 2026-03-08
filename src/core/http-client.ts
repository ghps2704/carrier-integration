import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CarrierError } from './errors.js';

export interface HttpResponse<T> {
  data: T;
  status: number;
}

/**
 * Thin wrapper around axios that normalizes all errors into CarrierError.
 * Callers never need to handle raw AxiosError or network exceptions.
 */
export class HttpClient {
  private readonly instance: AxiosInstance;

  constructor(
    private readonly carrier: string,
    timeoutMs = 10_000,
  ) {
    this.instance = axios.create({ timeout: timeoutMs });
  }

  async post<T>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    try {
      const response = await this.instance.post<T>(url, data, config);
      return { data: response.data, status: response.status };
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  private normalizeError(err: unknown): CarrierError {
    if (axios.isAxiosError(err)) {
      // No response = network-level failure (timeout, ECONNREFUSED, DNS, etc.)
      if (!err.response) {
        return new CarrierError(
          'NETWORK_TIMEOUT',
          `Network error: ${err.message}`,
          this.carrier,
          { cause: err },
        );
      }

      const status = err.response.status;
      const body: unknown = err.response.data;

      if (status === 401 || status === 403) {
        return new CarrierError('AUTH_FAILED', 'Authentication failed', this.carrier, {
          httpStatus: status,
          cause: err,
        });
      }

      if (status === 429) {
        return new CarrierError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded', this.carrier, {
          httpStatus: status,
          cause: err,
        });
      }

      const message = extractErrorMessage(body) ?? err.message;
      return new CarrierError('UPSTREAM_ERROR', message, this.carrier, {
        httpStatus: status,
        cause: err,
      });
    }

    return new CarrierError('UPSTREAM_ERROR', 'Unexpected error', this.carrier, { cause: err });
  }
}

/**
 * Extracts a human-readable error message from a UPS error response body.
 * UPS shape: { response: { errors: [{ code, message }] } }
 */
function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const errors = (body as Record<string, unknown>)['response'];
  if (!errors || typeof errors !== 'object') return undefined;
  const list = (errors as Record<string, unknown>)['errors'];
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list
    .filter(e => e && typeof e === 'object')
    .map(e => {
      const entry = e as Record<string, unknown>;
      return `[${entry['code']}] ${entry['message']}`;
    })
    .join('; ');
}
