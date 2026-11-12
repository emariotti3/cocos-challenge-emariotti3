/**
 * Prepares an isolated account for the k6 concurrency scenario: wipes the
 * orders of USER_ID (default 2, who has no seed orders) and credits a known
 * CASH_IN so each run starts from the same balance. Dev/test tool only.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-k6.ts [--user 2] [--cash 1000000]
 */
import { QueryTypes, Sequelize } from 'sequelize';
import { loadDotEnv, parseEnv } from '../src/config/env.schema';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value ?? process.env[`K6_${name.toUpperCase()}`] ?? fallback;
}

async function main(): Promise<void> {
  loadDotEnv();
  const env = parseEnv();
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed k6 data in production');

  const userId = Number(arg('user', '2'));
  const cash = arg('cash', '1000000');
  const sequelize = new Sequelize(env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    timezone: '+00:00',
  });
  try {
    const [ars] = await sequelize.query<{ id: number }>(
      "SELECT id FROM instruments WHERE type = 'MONEDA' LIMIT 1",
      {
        type: QueryTypes.SELECT,
      },
    );
    if (!ars) throw new Error('No MONEDA instrument found; run migrations and seed first');
    await sequelize.transaction(async (transaction) => {
      await sequelize.query('DELETE FROM orders WHERE userid = $userId', {
        bind: { userId },
        transaction,
      });
      await sequelize.query(
        `INSERT INTO orders (instrumentid, userid, size, price, side, status, type, datetime)
         VALUES ($arsId, $userId, $cash, 1, 'CASH_IN', 'FILLED', 'MARKET', now())`,
        { bind: { arsId: ars.id, userId, cash }, transaction },
      );
    });
    console.log(`k6 seed ready: user ${userId} has ${cash} ARS and no other orders`);
  } finally {
    await sequelize.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
