import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Sequelize } from 'sequelize';
import { configurePgTypeParsers } from '../../src/database/pg-types';
import { createMigrator, createSeeder } from '../../src/database/umzug';

declare global {
  var __POSTGRES_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/**
 * Starts one disposable Postgres 16 for the whole integration run, applies
 * the real migrations and the challenge seed, and hands the connection string
 * to the workers through the environment. Nothing is mocked below the HTTP
 * layer in these tests.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('cocos_test')
    .withUsername('cocos')
    .withPassword('cocos')
    .start();
  globalThis.__POSTGRES_CONTAINER__ = container;

  const url = container.getConnectionUri();
  process.env['DATABASE_URL'] = url;
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'silent';
  process.env['RATE_LIMIT_ENABLED'] = 'false';

  configurePgTypeParsers();
  const sequelize = new Sequelize(url, { dialect: 'postgres', logging: false, timezone: '+00:00' });
  try {
    await createMigrator(sequelize).up();
    await createSeeder(sequelize).up();
  } finally {
    await sequelize.close();
  }
}
