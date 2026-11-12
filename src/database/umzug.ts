import type { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

export interface MigrationContext {
  sequelize: Sequelize;
  queryInterface: QueryInterface;
}

export type MigrationFn = (params: { name: string; context: MigrationContext }) => Promise<void>;

interface MigrationModule {
  up: MigrationFn;
  down?: MigrationFn;
}

const MIGRATIONS_TABLE = 'sequelize_meta';
const SEEDERS_TABLE = 'sequelize_seed_meta';

/**
 * Builds an umzug runner over a folder of TypeScript (dev, via tsx) or
 * compiled JavaScript (image) files. The recorded name strips the extension
 * so both environments share the same history table rows.
 */
function buildRunner(sequelize: Sequelize, folder: string, tableName: string) {
  return new Umzug<MigrationContext>({
    migrations: {
      glob: [`${folder}/*.{ts,js}`, { cwd: __dirname, ignore: ['**/*.d.ts', '**/*.spec.ts'] }],
      resolve: ({ name, path, context }) => {
        if (!path) throw new Error(`Cannot resolve migration ${name}`);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const migration = require(path) as MigrationModule;
        const normalizedName = name.replace(/\.(ts|js)$/, '');
        return {
          name: normalizedName,
          up: () => migration.up({ name: normalizedName, context }),
          down: () => migration.down?.({ name: normalizedName, context }) ?? Promise.resolve(),
        };
      },
    },
    context: { sequelize, queryInterface: sequelize.getQueryInterface() },
    storage: new SequelizeStorage({ sequelize, tableName }),
    logger: process.env['LOG_LEVEL'] === 'silent' ? undefined : console,
  });
}

export const createMigrator = (sequelize: Sequelize) =>
  buildRunner(sequelize, 'migrations', MIGRATIONS_TABLE);

export const createSeeder = (sequelize: Sequelize) =>
  buildRunner(sequelize, 'seeders', SEEDERS_TABLE);
