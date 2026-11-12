import { type ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppConfig } from '../../config/app.config';

const LEDGER_MUTATION = /\/(orders(\/\d+\/cancel)?|cash\/(deposits|withdrawals))$/;

/**
 * Anything that moves cash or shares (order placement/cancellation, deposits,
 * withdrawals) gets a stricter per-IP budget than reads.
 */
export function isLedgerMutation(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<Request>();
  return request.method === 'POST' && LEDGER_MUTATION.test(request.path);
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            name: 'default',
            ttl: seconds(config.env.RATE_LIMIT_TTL_SECONDS),
            limit: (context: ExecutionContext) =>
              isLedgerMutation(context)
                ? config.env.RATE_LIMIT_ORDERS_LIMIT
                : config.env.RATE_LIMIT_LIMIT,
          },
        ],
        skipIf: () => !config.env.RATE_LIMIT_ENABLED,
        errorMessage: 'Too many requests from this client; retry after the window resets',
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
