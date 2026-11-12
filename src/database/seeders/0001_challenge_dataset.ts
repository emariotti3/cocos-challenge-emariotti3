import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QueryTypes } from 'sequelize';
import type { MigrationFn } from '../umzug';

/**
 * Loads the dataset shipped with the challenge (`database.sql` INSERT block,
 * copied verbatim to challenge-data.sql). It must run on empty tables so the
 * SERIAL ids match the original file (e.g. ARS cash instrument = 66).
 */
export const up: MigrationFn = async ({ context: { sequelize } }) => {
  const [row] = await sequelize.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM instruments',
    { type: QueryTypes.SELECT },
  );
  if ((row?.count ?? 0) > 0) {
    console.log('Seed skipped: instruments table already has data');
    return;
  }
  const sql = readFileSync(path.join(__dirname, 'challenge-data.sql'), 'utf8');
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(sql, { transaction, type: QueryTypes.RAW });
  });
};

export const down: MigrationFn = async ({ context: { sequelize } }) => {
  await sequelize.query(
    'TRUNCATE TABLE marketdata, orders, instruments, users RESTART IDENTITY CASCADE',
  );
};
