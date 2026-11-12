/**
 * Writes the OpenAPI document to docs/openapi.json without starting an HTTP
 * listener (the app is created only to introspect routes and DTOs).
 * Usage: npm run openapi:export
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { buildOpenApiConfig, setupApp } from '../app.setup';

async function main(): Promise<void> {
  process.env['LOG_LEVEL'] = 'silent';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  setupApp(app);
  const document = SwaggerModule.createDocument(app, buildOpenApiConfig(new DocumentBuilder()));
  const target = path.resolve(process.cwd(), 'docs', 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`OpenAPI written to ${target} (${Object.keys(document.paths).length} paths)`);
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
