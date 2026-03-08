/**
 * Raw UPS API shapes — only used inside the UPS module.
 * Callers see only the normalized internal types from core/types.ts.
 */

export interface UpsAddress {
  AddressLine?: string | string[];
  City: string;
  StateProvinceCode: string;
  PostalCode: string;
  CountryCode: string;
}

export interface UpsParty {
  Name?: string;
  Address: UpsAddress;
}

export interface UpsMoney {
  CurrencyCode: string;
  MonetaryValue: string;
}

// ─── Request ─────────────────────────────────────────────────────────────────

export interface UpsRateRequest {
  RateRequest: {
    Request: {
      RequestOption: 'Rate' | 'Shop';
      TransactionReference?: { CustomerContext: string };
    };
    Shipment: {
      Shipper: UpsParty;
      ShipTo: UpsParty;
      ShipFrom: UpsParty;
      /** Present only when requesting a specific service */
      Service?: { Code: string; Description?: string };
      Package: Array<{
        PackagingType: { Code: string };
        Dimensions: {
          UnitOfMeasurement: { Code: 'IN' | 'CM' };
          Length: string;
          Width: string;
          Height: string;
        };
        PackageWeight: {
          UnitOfMeasurement: { Code: 'LBS' | 'KGS' };
          Weight: string;
        };
      }>;
    };
  };
}

// ─── Response ────────────────────────────────────────────────────────────────

export interface UpsRatedShipment {
  Service: { Code: string };
  TotalCharges: UpsMoney;
  BillingWeight?: {
    Weight: string;
    UnitOfMeasurement: { Code: string };
  };
  GuaranteedDelivery?: {
    BusinessDaysInTransit?: string;
  };
}

export interface UpsRateResponse {
  RateResponse: {
    Response: {
      ResponseStatus: { Code: string; Description: string };
    };
    /** UPS returns a single object when one match, an array when many */
    RatedShipment: UpsRatedShipment | UpsRatedShipment[];
  };
}
