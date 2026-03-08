import { z } from 'zod';

// ─── Address ─────────────────────────────────────────────────────────────────

export const AddressSchema = z.object({
  name: z.string().optional(),
  street1: z.string().min(1, 'street1 is required'),
  street2: z.string().optional(),
  city: z.string().min(1, 'city is required'),
  /** Two-letter state/province code (e.g. "CA", "TX") */
  state: z.string().length(2, 'state must be a 2-letter code'),
  postalCode: z.string().min(1, 'postalCode is required'),
  /** ISO 3166-1 alpha-2 (e.g. "US", "CA") */
  countryCode: z.string().length(2, 'countryCode must be a 2-letter ISO code'),
});

export type Address = z.infer<typeof AddressSchema>;

// ─── Package ─────────────────────────────────────────────────────────────────

export const PackageSchema = z.object({
  weightLbs: z.number().positive('weightLbs must be positive'),
  lengthIn: z.number().positive('lengthIn must be positive'),
  widthIn: z.number().positive('widthIn must be positive'),
  heightIn: z.number().positive('heightIn must be positive'),
});

export type Package = z.infer<typeof PackageSchema>;

// ─── Rate Request (caller-facing) ─────────────────────────────────────────────

export const RateRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSchema).min(1, 'at least one package is required'),
  /**
   * Optional carrier-specific service code (e.g. "03" for UPS Ground).
   * When omitted the carrier is asked to return quotes for all available services.
   */
  serviceCode: z.string().optional(),
});

export type RateRequest = z.infer<typeof RateRequestSchema>;

// ─── Rate Quote (normalized, carrier-agnostic) ────────────────────────────────

export const RateQuoteSchema = z.object({
  carrier: z.string(),
  serviceCode: z.string(),
  serviceName: z.string(),
  totalCharge: z.number(),
  currency: z.string(),
  billingWeightLbs: z.number().optional(),
  estimatedTransitDays: z.number().int().optional(),
});

export type RateQuote = z.infer<typeof RateQuoteSchema>;
