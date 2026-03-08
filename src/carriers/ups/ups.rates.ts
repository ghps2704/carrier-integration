import { HttpClient } from '../../core/http-client.js';
import { RateRequest, RateQuote } from '../../core/types.js';
import { CarrierError } from '../../core/errors.js';
import { UpsAuthClient } from './ups.auth.js';
import { toUpsRateRequest, fromUpsRatedShipment } from './ups.mapper.js';
import { UpsRateResponse } from './ups.types.js';

export interface UpsRatesConfig {
  baseUrl: string;
}

/**
 * Encapsulates the UPS Rating API operation.
 * Kept separate from UpsCarrier so additional operations
 * (label, tracking) can be added as peer classes without bloating this file.
 */
export class UpsRatesOperation {
  constructor(
    private readonly auth: UpsAuthClient,
    private readonly http: HttpClient,
    private readonly config: UpsRatesConfig,
  ) {}

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    const token = await this.auth.getToken();

    // Use "Shop" to get all available services, "Rate" for a specific one
    const requestOption = request.serviceCode ? 'Rate' : 'Shop';
    const url = `${this.config.baseUrl}/api/rating/v2205/${requestOption}`;

    const response = await this.http.post<UpsRateResponse>(url, toUpsRateRequest(request), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // UPS requires these headers for traceability
        transId: `rate-${Date.now()}`,
        transactionSrc: 'carrier-integration-service',
      },
    });

    return this.parseResponse(response.data);
  }

  private parseResponse(data: unknown): RateQuote[] {
    if (!data || typeof data !== 'object') {
      throw new CarrierError('MALFORMED_RESPONSE', 'UPS returned an unexpected response shape', 'UPS');
    }

    const rateResponse = (data as UpsRateResponse).RateResponse;
    if (!rateResponse) {
      throw new CarrierError('MALFORMED_RESPONSE', 'UPS response missing RateResponse field', 'UPS');
    }

    // Normalize: UPS returns a single object for Rate, an array for Shop
    const shipments = Array.isArray(rateResponse.RatedShipment)
      ? rateResponse.RatedShipment
      : [rateResponse.RatedShipment];

    return shipments.map(fromUpsRatedShipment);
  }
}
