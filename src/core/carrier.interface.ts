import { RateRequest, RateQuote } from './types.js';

/**
 * Every carrier integration implements this interface.
 * Adding a new carrier (FedEx, USPS, DHL) means creating a new class that
 * satisfies this contract — no existing code needs to change.
 */
export interface ICarrier {
  readonly name: string;

  getRates(request: RateRequest): Promise<RateQuote[]>;

  // Future operations follow the same plug-in pattern:
  // createLabel(request: LabelRequest): Promise<Label>;
  // trackShipment(trackingNumber: string): Promise<TrackingEvent[]>;
  // validateAddress(address: Address): Promise<AddressValidationResult>;
}
