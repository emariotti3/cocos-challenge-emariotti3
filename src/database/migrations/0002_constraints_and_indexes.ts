import type { MigrationFn } from '../umzug';

/**
 * Hardening on top of the provided schema (see docs/DECISIONS.md):
 * - NOT NULL + CHECK constraints so invalid orders cannot be persisted.
 * - UNIQUE ticker / account number / (instrument, date).
 * - Indexes for the access paths the API uses (per-user order aggregates,
 *   order history listing, latest market data, trigram search).
 * - `datetime` defaults to now(); `rejection_reason` records why an order
 *   was REJECTED (auditability). Nullable so existing rows stay valid.
 */
const STATEMENTS = [
  'CREATE EXTENSION IF NOT EXISTS pg_trgm',

  'ALTER TABLE users ALTER COLUMN email SET NOT NULL',
  'ALTER TABLE users ALTER COLUMN accountnumber SET NOT NULL',
  'ALTER TABLE users ADD CONSTRAINT users_accountnumber_key UNIQUE (accountnumber)',

  'ALTER TABLE instruments ALTER COLUMN ticker SET NOT NULL',
  'ALTER TABLE instruments ALTER COLUMN name SET NOT NULL',
  'ALTER TABLE instruments ALTER COLUMN type SET NOT NULL',
  'ALTER TABLE instruments ADD CONSTRAINT instruments_ticker_key UNIQUE (ticker)',
  "ALTER TABLE instruments ADD CONSTRAINT instruments_type_check CHECK (type IN ('ACCIONES', 'MONEDA'))",
  'CREATE INDEX instruments_ticker_trgm_idx ON instruments USING gin (ticker gin_trgm_ops)',
  'CREATE INDEX instruments_name_trgm_idx ON instruments USING gin (name gin_trgm_ops)',

  'ALTER TABLE orders ALTER COLUMN instrumentid SET NOT NULL',
  'ALTER TABLE orders ALTER COLUMN userid SET NOT NULL',
  'ALTER TABLE orders ALTER COLUMN size SET NOT NULL',
  'ALTER TABLE orders ALTER COLUMN price SET NOT NULL',
  'ALTER TABLE orders ALTER COLUMN type SET NOT NULL',
  'ALTER TABLE orders ALTER COLUMN side SET NOT NULL',
  'ALTER TABLE orders ALTER COLUMN status SET NOT NULL',
  'ALTER TABLE orders ALTER COLUMN datetime SET NOT NULL',
  'ALTER TABLE orders ALTER COLUMN datetime SET DEFAULT now()',
  'ALTER TABLE orders ADD COLUMN rejection_reason VARCHAR(40)',
  'ALTER TABLE orders ADD CONSTRAINT orders_size_check CHECK (size > 0)',
  'ALTER TABLE orders ADD CONSTRAINT orders_price_check CHECK (price >= 0)',
  "ALTER TABLE orders ADD CONSTRAINT orders_type_check CHECK (type IN ('MARKET', 'LIMIT'))",
  "ALTER TABLE orders ADD CONSTRAINT orders_side_check CHECK (side IN ('BUY', 'SELL', 'CASH_IN', 'CASH_OUT'))",
  "ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('NEW', 'FILLED', 'REJECTED', 'CANCELLED'))",
  'CREATE INDEX orders_user_status_instrument_idx ON orders (userid, status, instrumentid)',
  'CREATE INDEX orders_user_datetime_idx ON orders (userid, datetime DESC, id DESC)',

  'ALTER TABLE marketdata ALTER COLUMN instrumentid SET NOT NULL',
  'ALTER TABLE marketdata ALTER COLUMN close SET NOT NULL',
  'ALTER TABLE marketdata ALTER COLUMN previousclose SET NOT NULL',
  'ALTER TABLE marketdata ALTER COLUMN date SET NOT NULL',
  'CREATE UNIQUE INDEX marketdata_instrument_date_key ON marketdata (instrumentid, date DESC)',
];

const ROLLBACK = [
  'DROP INDEX IF EXISTS marketdata_instrument_date_key',
  'ALTER TABLE marketdata ALTER COLUMN date DROP NOT NULL',
  'ALTER TABLE marketdata ALTER COLUMN previousclose DROP NOT NULL',
  'ALTER TABLE marketdata ALTER COLUMN close DROP NOT NULL',
  'ALTER TABLE marketdata ALTER COLUMN instrumentid DROP NOT NULL',

  'DROP INDEX IF EXISTS orders_user_datetime_idx',
  'DROP INDEX IF EXISTS orders_user_status_instrument_idx',
  'ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check',
  'ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_side_check',
  'ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_type_check',
  'ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_price_check',
  'ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_size_check',
  'ALTER TABLE orders DROP COLUMN IF EXISTS rejection_reason',
  'ALTER TABLE orders ALTER COLUMN datetime DROP DEFAULT',
  'ALTER TABLE orders ALTER COLUMN datetime DROP NOT NULL',
  'ALTER TABLE orders ALTER COLUMN status DROP NOT NULL',
  'ALTER TABLE orders ALTER COLUMN side DROP NOT NULL',
  'ALTER TABLE orders ALTER COLUMN type DROP NOT NULL',
  'ALTER TABLE orders ALTER COLUMN price DROP NOT NULL',
  'ALTER TABLE orders ALTER COLUMN size DROP NOT NULL',
  'ALTER TABLE orders ALTER COLUMN userid DROP NOT NULL',
  'ALTER TABLE orders ALTER COLUMN instrumentid DROP NOT NULL',

  'DROP INDEX IF EXISTS instruments_name_trgm_idx',
  'DROP INDEX IF EXISTS instruments_ticker_trgm_idx',
  'ALTER TABLE instruments DROP CONSTRAINT IF EXISTS instruments_type_check',
  'ALTER TABLE instruments DROP CONSTRAINT IF EXISTS instruments_ticker_key',
  'ALTER TABLE instruments ALTER COLUMN type DROP NOT NULL',
  'ALTER TABLE instruments ALTER COLUMN name DROP NOT NULL',
  'ALTER TABLE instruments ALTER COLUMN ticker DROP NOT NULL',

  'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_accountnumber_key',
  'ALTER TABLE users ALTER COLUMN accountnumber DROP NOT NULL',
  'ALTER TABLE users ALTER COLUMN email DROP NOT NULL',
];

export const up: MigrationFn = async ({ context: { sequelize } }) => {
  await sequelize.transaction(async (transaction) => {
    for (const statement of STATEMENTS) {
      await sequelize.query(statement, { transaction });
    }
  });
};

export const down: MigrationFn = async ({ context: { sequelize } }) => {
  await sequelize.transaction(async (transaction) => {
    for (const statement of ROLLBACK) {
      await sequelize.query(statement, { transaction });
    }
  });
};
