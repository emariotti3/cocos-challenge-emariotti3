import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import {
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_HEADER,
  UNLOGGED_PATH_PREFIXES,
} from '../../common/http/constants';
import { AppConfig } from '../../config/app.config';

/** Honors an incoming X-Request-Id (bounded length) or mints a UUID. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id =
    typeof candidate === 'string' &&
    candidate.length > 0 &&
    candidate.length <= MAX_REQUEST_ID_LENGTH
      ? candidate
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.env.LOG_LEVEL,
          genReqId: resolveRequestId,
          autoLogging: {
            ignore: (req: IncomingMessage) =>
              UNLOGGED_PATH_PREFIXES.some((prefix) => (req.url ?? '').startsWith(prefix)),
          },
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie'],
            censor: '[redacted]',
          },
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          transport:
            config.isProduction || config.isTest
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
                },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
