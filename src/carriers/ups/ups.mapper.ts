import { RateRequest, RateQuote } from '../../core/types.js';
import { UpsRateRequest, UpsRatedShipment } from './ups.types.js';
import { CarrierError } from '../../core/errors.js';

const UPS_SERVICE_NAMES: Record<string, string> = {
  '01': 'UPS Next Day Air',
  '02': 'UPS 2nd Day Air',
  '03': 'UPS Ground',
  '07': 'UPS Worldwide Express',
  '08': 'UPS Worldwide Expedited',
  '11': 'UPS Standard',
  '12': 'UPS 3 Day Select',
  '13': 'UPS Next Day Air Saver',
  '14': 'UPS Next Day Air Early',
  '54': 'UPS Worldwide Express Plus',
  '59': 'UPS 2nd Day Air A.M.',
  '65': 'UPS Worldwide Saver',
  '70': 'UPS Access Point Economy',
  '93': 'UPS Sure Post',
};

/** Converts internal RateRequest → UPS API request body */
export function toUpsRateRequest(request: RateRequest): UpsRateRequest {
  const toAddress = (addr: RateRequest['origin']) => ({
    AddressLine: addr.street2 ? [addr.street1, addr.street2] : addr.street1,
    City: addr.city,
    StateProvinceCode: addr.state,
    PostalCode: addr.postalCode,
    CountryCode: addr.countryCode,
  });

  return {
    RateRequest: {
      Request: {
        RequestOption: request.serviceCode ? 'Rate' : 'Shop',
        TransactionReference: { CustomerContext: 'carrier-integration-service' },
      },
      Shipment: {
        Shipper: { Name: request.origin.name, Address: toAddress(request.origin) },
        ShipTo: { Name: request.destination.name, Address: toAddress(request.destination) },
        // ShipFrom mirrors Shipper when they are the same location
        ShipFrom: { Name: request.origin.name, Address: toAddress(request.origin) },
        ...(request.serviceCode && { Service: { Code: request.serviceCode } }),
        Package: request.packages.map(pkg => ({
          PackagingType: { Code: '02' }, // 02 = Customer Supplied Package
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN' },
            Length: String(pkg.lengthIn),
            Width: String(pkg.widthIn),
            Height: String(pkg.heightIn),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS' },
            Weight: String(pkg.weightLbs),
          },
        })),
      },
    },
  };
}

/** Converts a single UPS RatedShipment → normalized RateQuote */
export function fromUpsRatedShipment(shipment: UpsRatedShipment): RateQuote {
  const serviceCode = shipment.Service.Code;
  const chargeStr = shipment.TotalCharges.MonetaryValue;
  const totalCharge = parseFloat(chargeStr);

  if (Number.isNaN(totalCharge)) {
    throw new CarrierError(
      'MALFORMED_RESPONSE',
      `UPS returned non-numeric TotalCharges: "${chargeStr}"`,
      'UPS',
    );
  }

  const transitRaw = shipment.GuaranteedDelivery?.BusinessDaysInTransit;
  const transitDays = transitRaw != null ? parseInt(transitRaw, 10) : undefined;

  const weightRaw = shipment.BillingWeight?.Weight;
  const billingWeightLbs = weightRaw != null ? parseFloat(weightRaw) : undefined;

  return {
    carrier: 'UPS',
    serviceCode,
    serviceName: UPS_SERVICE_NAMES[serviceCode] ?? `UPS Service ${serviceCode}`,
    totalCharge,
    currency: shipment.TotalCharges.CurrencyCode,
    billingWeightLbs: billingWeightLbs != null && !Number.isNaN(billingWeightLbs)
      ? billingWeightLbs
      : undefined,
    estimatedTransitDays: transitDays != null && !Number.isNaN(transitDays)
      ? transitDays
      : undefined,
  };
}
