export type CarrierErrorCode =
  | 'AUTH_FAILED'          // invalid credentials (401/403)
  | 'AUTH_REFRESH_FAILED'  // token fetch failed for non-auth reasons
  | 'INVALID_REQUEST'      // validation failed before sending
  | 'RATE_LIMIT_EXCEEDED'  // 429
  | 'UPSTREAM_ERROR'       // 4xx/5xx other than auth
  | 'NETWORK_TIMEOUT'      // no response (timeout, ECONNREFUSED, etc.)
  | 'MALFORMED_RESPONSE';  // response doesn't match expected shape

export class CarrierError extends Error {
  public readonly code: CarrierErrorCode;
  public readonly carrier: string;
  public readonly httpStatus?: number;
  public readonly cause?: unknown;

  constructor(
    code: CarrierErrorCode,
    message: string,
    carrier: string,
    options?: { httpStatus?: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'CarrierError';
    this.code = code;
    this.carrier = carrier;
    this.httpStatus = options?.httpStatus;
    this.cause = options?.cause;
  }
}
