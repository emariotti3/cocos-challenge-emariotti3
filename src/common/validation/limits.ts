/** Largest value a Postgres INTEGER (int4) column or bind parameter accepts. */
export const PG_INT_MAX = 2_147_483_647;

/** Matches a positive integer that also fits in int4 (so it can be bound safely). */
export const isPgInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= PG_INT_MAX;

const POSITIVE_INT_TEXT = /^[1-9]\d{0,9}$/;

/**
 * Parses a route or query parameter as a positive int4 id; null when it is
 * not one. Accepts the raw string from the router and the number the global
 * ValidationPipe produces for params declared as `Number` (`transform: true`).
 */
export function parsePgIntParam(raw: unknown): number | null {
  if (typeof raw === 'number') return isPgInt(raw) ? raw : null;
  if (typeof raw !== 'string' || !POSITIVE_INT_TEXT.test(raw)) return null;
  const value = Number(raw);
  return isPgInt(value) ? value : null;
}
