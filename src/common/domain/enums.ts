/**
 * Shared domain vocabulary. Values match what is persisted in the `orders` and
 * `instruments` tables (and enforced by CHECK constraints in migration 0002).
 */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatus {
  NEW = 'NEW',
  FILLED = 'FILLED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum InstrumentType {
  ACCIONES = 'ACCIONES',
  MONEDA = 'MONEDA',
}

export enum RejectionReason {
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_SHARES = 'INSUFFICIENT_SHARES',
}

/** Instrument id of the ARS cash instrument in the provided dataset. */
export const CASH_TICKER = 'ARS';
