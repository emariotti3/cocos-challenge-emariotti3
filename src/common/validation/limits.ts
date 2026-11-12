/** Largest value a Postgres INTEGER (int4) column or bind parameter accepts. */
export const PG_INT_MAX = 2_147_483_647;

/** Matches a positive integer that also fits in int4 (so it can be bound safely). */
export const isPgInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= PG_INT_MAX;
