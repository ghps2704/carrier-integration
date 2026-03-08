import { ICarrier } from '../../core/carrier.interface.js';
import { RateRequest, RateQuote, RateRequestSchema } from '../../core/types.js';
import { CarrierError } from '../../core/errors.js';
import { HttpClient } from '../../core/http-client.js';
import { UpsAuthClient, UpsAuthConfig } from './ups.auth.js';
import { UpsRatesOperation } from './ups.rates.js';

export interface UpsCarrierConfig {
  auth: UpsAuthConfig;
  baseUrl: string;
  timeoutMs?: number;
}

/**
 * UPS carrier implementation.
 * Wires together auth, HTTP client, and individual operations.
 * To add a new UPS operation (e.g. createLabel), add a new *Operation class
 * and call it here — no changes needed in core or other carriers.
 */
export class UpsCarrier implements ICarrier {
  readonly name = 'UPS';
  private readonly rates: UpsRatesOperation;

  constructor(config: UpsCarrierConfig) {
    const auth = new UpsAuthClient(config.auth);
    const http = new HttpClient('UPS', config.timeoutMs ?? 10_000);
    this.rates = new UpsRatesOperation(auth, http, { baseUrl: config.baseUrl });
  }

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    // Validate input at the public boundary before touching the network
    const parsed = RateRequestSchema.safeParse(request);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new CarrierError('INVALID_REQUEST', `Invalid rate request: ${issues}`, this.name);
    }
    return this.rates.getRates(parsed.data);
  }
}
