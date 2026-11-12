import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import type { Sequelize } from 'sequelize';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';

export interface TestApp {
  app: INestApplication;
  sequelize: Sequelize;
  close: () => Promise<void>;
}

/** Boots the real AppModule with the same HTTP pipeline as main.ts. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: false,
    logger: false,
  });
  setupApp(app);
  await app.init();
  const sequelize = app.get<Sequelize>(getConnectionToken());
  return { app, sequelize, close: () => app.close() };
}
