import {
  type INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { validationExceptionFactory } from './common/pipes/validation-exception.factory';
import { AppConfig } from './config/app.config';

export const API_PREFIX = 'api';
export const API_VERSION = '1';

const UNPREFIXED_ROUTES = ['health', 'health/live', 'health/ready', 'metrics'].map((path) => ({
  path,
  method: RequestMethod.ALL,
}));

/**
 * Applies the cross-cutting HTTP configuration. Shared by `main.ts` and the
 * integration tests so both exercise exactly the same pipeline.
 */
export function setupApp(app: NestExpressApplication): INestApplication {
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'OPTIONS'] });

  app.setGlobalPrefix(API_PREFIX, { exclude: UNPREFIXED_ROUTES });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  return app;
}

export function buildOpenApiConfig(builder: DocumentBuilder) {
  return builder
    .setTitle('Cocos Challenge API')
    .setDescription(
      'Portfolio, instrument search and order placement API. Prices are in ARS; money values are decimal strings. Errors use RFC 7807 application/problem+json.',
    )
    .setVersion('1.0.0')
    .addTag('instruments', 'Instrument search and market data')
    .addTag('portfolio', 'Account value, cash and positions')
    .addTag('orders', 'Order placement, cancellation and history')
    .build();
}

export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(app, buildOpenApiConfig(new DocumentBuilder()));
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });
}
