import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import type { Sequelize } from 'sequelize';
import { OrderSide, OrderStatus, OrderType, RejectionReason } from '../../common/domain/enums';
import { MetricsService } from './metrics.service';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches one exposition line regardless of label order. */
const series = (name: string, labels: string[], value: number) =>
  new RegExp(
    `^${name}\\{${labels.map((label) => `(?=[^}]*${escapeRegExp(label)})`).join('')}[^}]*\\} ${value}$`,
    'm',
  );

describe('MetricsService', () => {
  const sequelize = {
    connectionManager: { pool: { size: 3, available: 1, using: 2, waiting: 0 } },
  } as unknown as Sequelize;

  it('records orders, rejections and cancellations', async () => {
    const service = new MetricsService(sequelize);
    service.recordOrder({
      status: OrderStatus.FILLED,
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      rejectionReason: null,
    });
    service.recordOrder({
      status: OrderStatus.REJECTED,
      side: OrderSide.SELL,
      type: OrderType.MARKET,
      rejectionReason: RejectionReason.INSUFFICIENT_SHARES,
    });
    service.recordCancellation();

    const text = await service.scrape();
    expect(text).toMatch(
      series('orders_placed_total', ['status="FILLED"', 'side="BUY"', 'type="MARKET"'], 1),
    );
    expect(text).toMatch(series('orders_rejected_total', ['reason="INSUFFICIENT_SHARES"'], 1));
    expect(text).toMatch(series('orders_cancelled_total', ['service="cocos-api"'], 1));
    expect(text).toMatch(series('db_pool_connections', ['state="used"'], 2));
    expect(service.contentType).toContain('text/plain');
  });

  it('observes http requests by route template and status', async () => {
    const service = new MetricsService(sequelize);
    const response = Object.assign(new EventEmitter(), { statusCode: 201 }) as unknown as Response;
    const request = {
      method: 'POST',
      path: '/api/v1/users/1/orders',
      route: { path: '/api/v1/users/:userId/orders' },
    } as unknown as Request;
    const next = jest.fn();

    service.httpMiddleware()(request, response, next);
    expect(next).toHaveBeenCalled();
    expect(await service.scrape()).toMatch(
      series('http_server_requests_in_flight', ['service="cocos-api"'], 1),
    );

    response.emit('finish');
    const text = await service.scrape();
    expect(text).toMatch(series('http_server_requests_in_flight', ['service="cocos-api"'], 0));
    expect(text).toMatch(
      series(
        'http_server_request_duration_seconds_count',
        ['method="POST"', 'route="/api/v1/users/:userId/orders"', 'status_code="201"'],
        1,
      ),
    );
  });

  it('labels unmatched routes without leaking the raw path', async () => {
    const service = new MetricsService(sequelize);
    const response = Object.assign(new EventEmitter(), { statusCode: 404 }) as unknown as Response;
    service.httpMiddleware()(
      { method: 'GET', path: '/secret/123' } as unknown as Request,
      response,
      jest.fn(),
    );
    response.emit('finish');
    const text = await service.scrape();
    expect(text).toMatch(
      series(
        'http_server_request_duration_seconds_count',
        ['route="unmatched"', 'status_code="404"'],
        1,
      ),
    );
    expect(text).not.toContain('/secret/123');
  });
});
