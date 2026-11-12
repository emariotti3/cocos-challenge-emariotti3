import { type ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppConfig } from '../../config/app.config';

const ORDER_MUTATION = /\/orders(\/\d+\/cancel)?$/;

/** Order placement/cancellation gets a stricter per-IP budget than reads. */
export function isOrderMutation(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<Request>();
  return request.method === 'POST' && ORDER_MUTATION.test(request.path);
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
              isOrderMutation(context)
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
