import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Sequelize } from 'sequelize';

const SEED_FILE = path.resolve(__dirname, '../../src/database/seeders/challenge-data.sql');

function seedOrdersSql(): string {
  const sql = readFileSync(SEED_FILE, 'utf8');
  const start = sql.indexOf('INSERT INTO "orders"');
  if (start < 0) throw new Error('orders seed block not found');
  return sql.slice(start);
}

const ORDERS_SEED = seedOrdersSql();

/** Restores the `orders` table to the challenge dataset (ids 1..11). */
export async function resetOrders(sequelize: Sequelize): Promise<void> {
  await sequelize.query('TRUNCATE TABLE orders RESTART IDENTITY');
  await sequelize.query(ORDERS_SEED);
}

export async function countOrders(sequelize: Sequelize): Promise<number> {
  const [[row]] = (await sequelize.query('SELECT count(*)::int AS count FROM orders')) as [
    [{ count: number }],
    unknown,
  ];
  return row.count;
}
