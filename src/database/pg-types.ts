import { types } from 'pg';

const TIMESTAMP_WITHOUT_TZ_OID = 1114;
const DATE_OID = 1082;

let configured = false;

/**
 * The provided schema stores `orders.datetime` as TIMESTAMP (without time
 * zone). node-postgres would interpret such values in the process' local
 * time zone, which makes results machine-dependent. We treat every stored
 * timestamp as UTC, and Sequelize is configured to write UTC (`timezone`).
 * DATE columns are returned as plain yyyy-mm-dd strings (no local-midnight
 * Date objects). NUMERIC (1700) and BIGINT (20) keep node-postgres' default
 * string parsing, so money never passes through a JS float.
 */
export function configurePgTypeParsers(): void {
  if (configured) return;
  configured = true;
  types.setTypeParser(
    TIMESTAMP_WITHOUT_TZ_OID,
    (value: string) => new Date(`${value.replace(' ', 'T')}Z`),
  );
  types.setTypeParser(DATE_OID, (value: string) => value);
}
