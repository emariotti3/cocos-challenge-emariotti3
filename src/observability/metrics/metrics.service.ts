import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { Sequelize } from 'sequelize';
import type { OrderSide, OrderStatus, OrderType, RejectionReason } from '../../common/domain/enums';

interface PoolStats {
  size: number;
  available: number;
  using: number;
  waiting: number;
}

function poolOf(sequelize: Sequelize): PoolStats | undefined {
  const manager = sequelize.connectionManager as unknown as { pool?: Partial<PoolStats> };
  const pool = manager.pool;
  if (!pool) return undefined;
  return {
    size: pool.size ?? 0,
    available: pool.available ?? 0,
    using: pool.using ?? 0,
    waiting: pool.waiting ?? 0,
  };
}

/** Route template (bounded cardinality) rather than the raw URL. */
function routeOf(request: Request, response: Response): string {
  const route: unknown = (request as unknown as { route?: unknown }).route;
  const template =
    typeof route === 'object' && route !== null ? (route as { path?: unknown }).path : undefined;
  if (typeof template === 'string') return template;
  return response.statusCode === 404 ? 'unmatched' : request.path;
}

/**
 * Prometheus registry for the service. HTTP metrics come from an Express
 * middleware so 4xx/5xx and unmatched routes are counted too; business
 * counters are incremented by the orders service.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpDuration = new Histogram({
    name: 'http_server_request_duration_seconds',
    help: 'HTTP request duration in seconds by method, route template and status code',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  private readonly inFlight = new Gauge({
    name: 'http_server_requests_in_flight',
    help: 'HTTP requests currently being processed',
    registers: [this.registry],
  });

  private readonly ordersPlaced = new Counter({
    name: 'orders_placed_total',
    help: 'Orders accepted by the API by resulting status, side and type',
    labelNames: ['status', 'side', 'type'] as const,
    registers: [this.registry],
  });

  private readonly ordersRejected = new Counter({
    name: 'orders_rejected_total',
    help: 'Orders rejected by the market rules, by reason',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  private readonly ordersCancelled = new Counter({
    name: 'orders_cancelled_total',
    help: 'Orders cancelled by users',
    registers: [this.registry],
  });

  constructor(@InjectConnection() sequelize: Sequelize) {
    this.registry.setDefaultLabels({ service: 'cocos-api' });
    collectDefaultMetrics({ register: this.registry });
    new Gauge({
      name: 'db_pool_connections',
      help: 'Sequelize connection pool by state (used, free, pending, total)',
      labelNames: ['state'] as const,
      registers: [this.registry],
      collect() {
        const pool = poolOf(sequelize);
        if (!pool) return;
        this.set({ state: 'used' }, pool.using);
        this.set({ state: 'free' }, pool.available);
        this.set({ state: 'pending' }, pool.waiting);
        this.set({ state: 'total' }, pool.size);
      },
    });
  }

  httpMiddleware() {
    return (request: Request, response: Response, next: NextFunction): void => {
      const stop = this.httpDuration.startTimer();
      this.inFlight.inc();
      response.once('finish', () => {
        this.inFlight.dec();
        stop({
          method: request.method,
          route: routeOf(request, response),
          status_code: String(response.statusCode),
        });
      });
      next();
    };
  }

  recordOrder(order: {
    status: OrderStatus;
    side: OrderSide;
    type: OrderType;
    rejectionReason: RejectionReason | null;
  }): void {
    this.ordersPlaced.inc({ status: order.status, side: order.side, type: order.type });
    if (order.rejectionReason) this.ordersRejected.inc({ reason: order.rejectionReason });
  }

  recordCancellation(): void {
    this.ordersCancelled.inc();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
