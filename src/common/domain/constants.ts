/**
 * Business constants shared across modules. Anything that encodes a rule of
 * the product (currency, cash convention, trading and paging bounds) lives
 * here so it is defined once and documented once. Technical limits that
 * mirror the database live in `common/validation/limits.ts`.
 */

/** Every price and amount in the API is in Argentine pesos. */
export const CURRENCY = 'ARS';
/** Ticker of the cash instrument (type MONEDA) in the dataset. */
export const CASH_TICKER = CURRENCY;
/** Cash movements are orders at this unit price, with `size = amount` (dataset convention). */
export const CASH_UNIT_PRICE = '1.00';
/** Money travels as decimal strings with this many places (cents). */
export const MONEY_DECIMALS = 2;
/** Percentages (returns) are reported with this many places. */
export const PERCENT_DECIMALS = 2;

// --- order and cash bounds (also enforced by the DTOs; keep in sync with the CHECK constraints)
/** Shares per order; well inside the INTEGER `size` column. */
export const MAX_ORDER_SIZE = 1_000_000_000;
/** NUMERIC(10,2) upper bound for prices (exclusive). */
export const MAX_PRICE_EXCLUSIVE = 100_000_000;
/** Budget cap (exclusive); keeps floor(amount / price) inside MAX_ORDER_SIZE for any price >= 0.01. */
export const MAX_AMOUNT_EXCLUSIVE = 10_000_000_000;
/** Whole ARS per deposit or withdrawal; fits the INTEGER `size` column. */
export const MAX_CASH_AMOUNT = 2_000_000_000;

// --- search
export const MAX_SEARCH_TERM_LENGTH = 50;
export const MAX_TICKER_LENGTH = 10;

// --- pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_CURSOR_LENGTH = 200;
