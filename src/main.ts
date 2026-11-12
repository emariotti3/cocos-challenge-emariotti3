import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupApp, setupSwagger } from './app.setup';
import { AppConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  setupApp(app);
  setupSwagger(app);

  const config = app.get(AppConfig);
  await app.listen(config.env.PORT, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`API listening on port ${config.env.PORT} (${config.env.NODE_ENV}); docs at /docs`);
}

bootstrap().catch((error: unknown) => {
  // Logger may not be available if bootstrap failed early (e.g. invalid env).
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
