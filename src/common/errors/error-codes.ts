/**
 * Stable machine-readable `code` values of the problem+json error body. They
 * are part of the public contract (documented in the README and asserted by
 * the integration tests), so add new ones here rather than inline.
 */
export const ErrorCode = {
  // request shape
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  // domain
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INSTRUMENT_NOT_FOUND: 'INSTRUMENT_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_NOT_CANCELLABLE: 'ORDER_NOT_CANCELLABLE',
  NOT_TRADABLE: 'NOT_TRADABLE',
  NO_MARKET_PRICE: 'NO_MARKET_PRICE',
  AMOUNT_TOO_SMALL: 'AMOUNT_TOO_SMALL',
  ORDER_TOO_LARGE: 'ORDER_TOO_LARGE',
  // infrastructure
  LEDGER_BUSY: 'LEDGER_BUSY',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
