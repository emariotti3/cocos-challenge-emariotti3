import { Sequelize } from 'sequelize';
import { loadDotEnv, parseEnv } from '../config/env.schema';
import { configurePgTypeParsers } from './pg-types';
import { createMigrator, createSeeder } from './umzug';

const USAGE = `Usage: cli <command>
  up          apply pending schema migrations
  down        revert the last applied migration
  status      list executed and pending migrations
  seed        load the challenge dataset (idempotent)
  seed:undo   remove the challenge dataset`;

async function main(): Promise<void> {
  loadDotEnv();
  const env = parseEnv();
  configurePgTypeParsers();
  const sequelize = new Sequelize(env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    timezone: '+00:00',
  });
  const migrator = createMigrator(sequelize);
  const seeder = createSeeder(sequelize);
  const [command = 'status'] = process.argv.slice(2);

  try {
    switch (command) {
      case 'up': {
        const applied = await migrator.up();
        console.log(
          applied.length ? `Applied: ${applied.map((m) => m.name).join(', ')}` : 'Up to date',
        );
        break;
      }
      case 'down': {
        const reverted = await migrator.down();
        console.log(
          reverted.length
            ? `Reverted: ${reverted.map((m) => m.name).join(', ')}`
            : 'Nothing to revert',
        );
        break;
      }
      case 'status': {
        const executed = await migrator.executed();
        const pending = await migrator.pending();
        console.log(`Executed (${executed.length}):`);
        executed.forEach((m) => console.log(`  [x] ${m.name}`));
        console.log(`Pending (${pending.length}):`);
        pending.forEach((m) => console.log(`  [ ] ${m.name}`));
        const seeded = await seeder.executed();
        console.log(
          `Seeders executed (${seeded.length}): ${seeded.map((m) => m.name).join(', ') || '-'}`,
        );
        break;
      }
      case 'seed': {
        const applied = await seeder.up();
        console.log(
          applied.length ? `Seeded: ${applied.map((m) => m.name).join(', ')}` : 'Already seeded',
        );
        break;
      }
      case 'seed:undo': {
        await seeder.down({ to: 0 });
        console.log('Seed data removed');
        break;
      }
      default:
        console.error(`Unknown command "${command}"\n${USAGE}`);
        process.exitCode = 1;
    }
  } finally {
    await sequelize.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
