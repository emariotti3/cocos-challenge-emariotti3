import request from 'supertest';
import { Money } from '../../src/common/money/money';
import { OrdersRepository } from '../../src/modules/orders/orders.repository';
import { createTestApp, type TestApp } from '../helpers/app.factory';
import { countOrders, resetOrders } from '../helpers/db.reset';

const MONEY = /^-?\d+\.\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PAMP = 47;
const PAMP_CLOSE = '925.85';

const ids = (body: unknown): number[] => (body as { data: { id: number }[] }).data.map((o) => o.id);

/**
 * Functional tests for order placement (required by the challenge), plus
 * cancellation, listing and the concurrency guarantee. They run against a
 * real Postgres with the real migrations and seed; the orders table is
 * restored to the seed between tests.
 */
describe('Orders API', () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());
  const place = (body: Record<string, unknown>, userId = 1) =>
    api().post(`/api/v1/users/${userId}/orders`).send(body);
  const portfolio = async (userId = 1) => {
    const res = await api().get(`/api/v1/users/${userId}/portfolio`).expect(200);
    return res.body as {
      totalValue: string;
      cash: { total: string; reserved: string; available: string };
      positions: {
        ticker: string;
        quantity: number;
        reservedQuantity: number;
        availableQuantity: number;
      }[];
    };
  };
  const pamp = async () => (await portfolio()).positions.find((p) => p.ticker === 'PAMP');

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetOrders(t.sequelize));

  describe('MARKET orders', () => {
    it('fills a MARKET BUY at the last close and updates cash and the position', async () => {
      const res = await place({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 10 }).expect(
        201,
      );
      expect(res.body).toMatchObject({
        userId: 1,
        instrumentId: PAMP,
        ticker: 'PAMP',
        side: 'BUY',
        type: 'MARKET',
        status: 'FILLED',
        size: 10,
        price: PAMP_CLOSE,
        notional: '9258.50',
        rejectionReason: null,
      });
      expect(res.body.id).toBe(12);
      expect(res.body.datetime).toMatch(ISO_DATE);

      const after = await portfolio();
      expect(after.cash).toEqual({
        total: '743741.50',
        reserved: '125500.00',
        available: '618241.50',
      });
      expect(await pamp()).toMatchObject({ quantity: 50, availableQuantity: 50 });
    });

    it('fills a MARKET SELL and credits the cash', async () => {
      await place({ instrumentId: PAMP, side: 'SELL', type: 'MARKET', size: 10 })
        .expect(201)
        .expect((res) => {
          expect(res.body.status).toBe('FILLED');
        });
      expect((await portfolio()).cash.total).toBe('762258.50');
      expect(await pamp()).toMatchObject({ quantity: 30 });
    });

    it('converts an ARS amount into the maximum whole number of shares', async () => {
      const amount = '100000';
      const res = await place({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', amount }).expect(
        201,
      );
      const expectedSize = Money.of(amount).floorDiv(PAMP_CLOSE);
      expect(expectedSize).toBe(108);
      expect(res.body).toMatchObject({
        status: 'FILLED',
        size: expectedSize,
        price: PAMP_CLOSE,
        notional: '99991.80',
      });
    });

    it('tolerates surrounding whitespace in amount and price strings', async () => {
      const market = await place({
        instrumentId: PAMP,
        side: 'BUY',
        type: 'MARKET',
        amount: ' 100000 ',
      }).expect(201);
      expect(market.body).toMatchObject({ status: 'FILLED', size: 108 });
      const limit = await place({
        instrumentId: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        size: 1,
        price: ' 900 ',
      }).expect(201);
      expect(limit.body).toMatchObject({ status: 'NEW', price: '900.00' });
    });

    it('sizes an amount-based SELL with the last close', async () => {
      // 20,000 / 925.85 = 21.6 -> 21 shares out of the 40 held
      const res = await place({
        instrumentId: PAMP,
        side: 'SELL',
        type: 'MARKET',
        amount: '20000',
      }).expect(201);
      expect(res.body).toMatchObject({ status: 'FILLED', size: 21 });
      expect(await pamp()).toMatchObject({ quantity: 19 });
    });

    it('accepts the amount as a JSON number too', async () => {
      const res = await place({
        instrumentId: PAMP,
        side: 'BUY',
        type: 'MARKET',
        amount: 1851.7,
      }).expect(201);
      expect(res.body.size).toBe(2);
    });
  });

  describe('LIMIT orders', () => {
    it('stores a LIMIT BUY as NEW and reserves the cash without spending it', async () => {
      const res = await place({
        instrumentId: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        size: 10,
        price: '900',
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'NEW',
        price: '900.00',
        notional: '9000.00',
        rejectionReason: null,
      });
      expect((await portfolio()).cash).toEqual({
        total: '753000.00',
        reserved: '134500.00',
        available: '618500.00',
      });
    });

    it('stores a LIMIT SELL as NEW and reserves the shares', async () => {
      await place({
        instrumentId: PAMP,
        side: 'SELL',
        type: 'LIMIT',
        size: 10,
        price: '1000',
      }).expect(201);
      expect(await pamp()).toMatchObject({
        quantity: 40,
        reservedQuantity: 10,
        availableQuantity: 30,
      });
    });

    it('sizes an amount-based LIMIT order with the limit price', async () => {
      const res = await place({
        instrumentId: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        amount: '2500',
        price: '1000',
      }).expect(201);
      expect(res.body).toMatchObject({ status: 'NEW', size: 2 });
    });

    it('accepts a LIMIT order on an instrument without market data', async () => {
      const res = await place({
        instrumentId: 3,
        side: 'BUY',
        type: 'LIMIT',
        size: 1,
        price: '10.50',
      }).expect(201);
      expect(res.body).toMatchObject({ ticker: 'PGR', status: 'NEW', price: '10.50' });
    });
  });

  describe('market rejections (persisted as REJECTED)', () => {
    it('rejects a BUY above the AVAILABLE cash even when total cash would cover it', async () => {
      // 700 * 925.85 = 648,095 > 627,500 available but < 753,000 total
      const res = await place({
        instrumentId: PAMP,
        side: 'BUY',
        type: 'MARKET',
        size: 700,
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_FUNDS',
        notional: '648095.00',
      });

      const stored = await api().get(`/api/v1/users/1/orders/${res.body.id}`).expect(200);
      expect(stored.body.status).toBe('REJECTED');
      expect(await countOrders(t.sequelize)).toBe(12);
      expect((await portfolio()).cash).toEqual({
        total: '753000.00',
        reserved: '125500.00',
        available: '627500.00',
      });
    });

    it('rejects a SELL above the position', async () => {
      const res = await place({
        instrumentId: PAMP,
        side: 'SELL',
        type: 'MARKET',
        size: 41,
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_SHARES',
      });
      expect(await pamp()).toMatchObject({ quantity: 40 });
    });

    it('rejects a SELL on the inconsistent negative seed position (BMA)', async () => {
      const res = await place({ instrumentId: 31, side: 'SELL', type: 'MARKET', size: 1 }).expect(
        201,
      );
      expect(res.body).toMatchObject({
        ticker: 'BMA',
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_SHARES',
      });
    });

    it('counts pending SELL reservations against availability', async () => {
      await place({
        instrumentId: PAMP,
        side: 'SELL',
        type: 'LIMIT',
        size: 40,
        price: '1000',
      }).expect(201);
      const res = await place({ instrumentId: PAMP, side: 'SELL', type: 'MARKET', size: 1 }).expect(
        201,
      );
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_SHARES',
      });
    });

    it('accepts a BUY whose notional equals the available cash exactly', async () => {
      const res = await place({
        instrumentId: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        size: 1,
        price: '627500',
      }).expect(201);
      expect(res.body.status).toBe('NEW');
      expect((await portfolio()).cash.available).toBe('0.00');
    });

    it('counts pending BUY reservations against cash', async () => {
      await place({
        instrumentId: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        size: 600,
        price: '1000',
      }).expect(201); // reserves 600,000
      const res = await place({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 30 }).expect(
        201,
      ); // 27,775.50 > 27,500
      expect(res.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
    });
  });

  describe('request validation (400, nothing persisted)', () => {
    const base = { instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 1 };
    it.each<[string, Record<string, unknown>, string]>([
      ['LIMIT without price', { ...base, type: 'LIMIT' }, 'price'],
      ['MARKET with price', { ...base, price: '900' }, 'price'],
      ['both size and amount', { ...base, amount: '900' }, 'amount'],
      ['neither size nor amount', { instrumentId: PAMP, side: 'BUY', type: 'MARKET' }, 'size'],
      ['size 0', { ...base, size: 0 }, 'size'],
      ['negative size', { ...base, size: -1 }, 'size'],
      ['fractional size', { ...base, size: 1.5 }, 'size'],
      ['size as string', { ...base, size: '10' }, 'size'],
      ['amount with 3 decimals', { ...base, size: undefined, amount: '100.123' }, 'amount'],
      ['amount in scientific notation', { ...base, size: undefined, amount: '1e5' }, 'amount'],
      ['negative price', { ...base, type: 'LIMIT', price: '-1' }, 'price'],
      ['price too large', { ...base, type: 'LIMIT', price: '100000000' }, 'price'],
      ['side CASH_IN', { ...base, side: 'CASH_IN' }, 'side'],
      ['unknown side', { ...base, side: 'HOLD' }, 'side'],
      ['unknown type', { ...base, type: 'STOP' }, 'type'],
      ['missing instrumentId', { side: 'BUY', type: 'MARKET', size: 1 }, 'instrumentId'],
      ['instrumentId above int4', { ...base, instrumentId: 2_147_483_648 }, 'instrumentId'],
      ['unknown field', { ...base, foo: 1 }, 'foo'],
    ])('%s', async (_name, body, path) => {
      const res = await place(body)
        .expect(400)
        .expect('Content-Type', /application\/problem\+json/);
      expect(res.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
      expect(res.headers['x-request-id']).toBeDefined();
      expect(await countOrders(t.sequelize)).toBe(11);
    });

    it('rejects a non-JSON body', async () => {
      await api()
        .post('/api/v1/users/1/orders')
        .set('content-type', 'application/json')
        .send('{not json')
        .expect(400);
    });
  });

  describe('semantic rejections (4xx, nothing persisted)', () => {
    it.each<[string, Record<string, unknown>, number, string]>([
      [
        'unknown instrument',
        { instrumentId: 9999, side: 'BUY', type: 'MARKET', size: 1 },
        404,
        'INSTRUMENT_NOT_FOUND',
      ],
      [
        'cash instrument',
        { instrumentId: 66, side: 'BUY', type: 'MARKET', size: 1 },
        422,
        'NOT_TRADABLE',
      ],
      [
        'MARKET without market data',
        { instrumentId: 3, side: 'BUY', type: 'MARKET', size: 1 },
        422,
        'NO_MARKET_PRICE',
      ],
      [
        'amount below one share',
        { instrumentId: PAMP, side: 'BUY', type: 'MARKET', amount: '900' },
        422,
        'AMOUNT_TOO_SMALL',
      ],
    ])('%s', async (_name, body, status, code) => {
      const res = await place(body).expect(status);
      expect(res.body).toMatchObject({ status, code });
      expect(await countOrders(t.sequelize)).toBe(11);
    });

    it('returns 404 USER_NOT_FOUND for an unknown user', async () => {
      const res = await place(
        { instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 1 },
        999,
      ).expect(404);
      expect(res.body.code).toBe('USER_NOT_FOUND');
    });

    it('returns 500 problem+json and persists nothing when the insert fails', async () => {
      const spy = jest
        .spyOn(OrdersRepository.prototype, 'create')
        .mockRejectedValueOnce(new Error('boom'));
      const res = await place({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 1 }).expect(
        500,
      );
      expect(res.body).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
      expect(res.body.detail).not.toContain('boom');
      expect(await countOrders(t.sequelize)).toBe(11);
      spy.mockRestore();
    });
  });

  describe('cancellation', () => {
    it('cancels a NEW order and releases the reserved cash', async () => {
      const res = await api().post('/api/v1/users/1/orders/5/cancel').expect(200);
      expect(res.body).toMatchObject({ id: 5, status: 'CANCELLED', type: 'LIMIT' });
      expect((await portfolio()).cash).toEqual({
        total: '753000.00',
        reserved: '90000.00',
        available: '663000.00',
      });
    });

    it.each([
      [2, 'FILLED'],
      [3, 'CANCELLED'],
      [6, 'REJECTED'],
    ])('refuses to cancel order %i (%s) with 409', async (orderId, status) => {
      const res = await api().post(`/api/v1/users/1/orders/${orderId}/cancel`).expect(409);
      expect(res.body).toMatchObject({
        code: 'ORDER_NOT_CANCELLABLE',
        status: 409,
        orderId,
        orderStatus: status,
      });
      const stored = await api().get(`/api/v1/users/1/orders/${orderId}`).expect(200);
      expect(stored.body.status).toBe(status);
    });

    it("returns 404 for another user's order or a missing one", async () => {
      await api().post('/api/v1/users/2/orders/5/cancel').expect(404);
      await api().post('/api/v1/users/1/orders/9999/cancel').expect(404);
      await api().post('/api/v1/users/1/orders/abc/cancel').expect(400);
    });
  });

  describe('listing', () => {
    it('lists newest first and paginates with a cursor', async () => {
      const first = await api().get('/api/v1/users/1/orders?limit=5').expect(200);
      expect(ids(first.body)).toEqual([11, 10, 9, 8, 7]);
      expect(first.body.meta.nextCursor).toEqual(expect.any(String));

      const second = await api()
        .get(`/api/v1/users/1/orders?limit=5&cursor=${first.body.meta.nextCursor}`)
        .expect(200);
      expect(ids(second.body)).toEqual([6, 5, 4, 3, 2]);

      const third = await api()
        .get(`/api/v1/users/1/orders?limit=5&cursor=${second.body.meta.nextCursor}`)
        .expect(200);
      expect(ids(third.body)).toEqual([1]);
      expect(third.body.meta.nextCursor).toBeNull();
    });

    it('filters by status, side and instrument', async () => {
      const res = await api().get('/api/v1/users/1/orders?status=NEW').expect(200);
      expect(ids(res.body)).toEqual([7, 5]);
      const sells = await api().get('/api/v1/users/1/orders?side=SELL&instrumentId=47').expect(200);
      expect(ids(sells.body)).toEqual([6, 4]);
    });

    it('rejects ids above int4 on the list filter, the order route and the user route with 400', async () => {
      await api().get('/api/v1/users/1/orders?instrumentId=2147483648').expect(400);
      await api().get('/api/v1/users/1/orders/2147483648').expect(400);
      await api().get('/api/v1/users/2147483648/orders').expect(400);
      await api().get('/api/v1/users/1/orders/2147483647').expect(404); // in range: just not there
    });

    it('rejects a malformed cursor and returns an empty list for a user without orders', async () => {
      await api().get('/api/v1/users/1/orders?cursor=garbage').expect(400);
      const lenientDate = Buffer.from('{"d":"2024","i":1}').toString('base64url');
      await api().get(`/api/v1/users/1/orders?cursor=${lenientDate}`).expect(400);
      const res = await api().get('/api/v1/users/2/orders').expect(200);
      expect(res.body).toEqual({ data: [], meta: { nextCursor: null } });
    });

    it('serializes money as 2-decimal strings', async () => {
      const res = await api().get('/api/v1/users/1/orders/1').expect(200);
      expect(res.body).toMatchObject({ side: 'CASH_IN', price: '1.00', notional: '1000000.00' });
      expect(res.body.price).toMatch(MONEY);
      expect(res.body.notional).toMatch(MONEY);
    });
  });

  describe('concurrency', () => {
    it('never overdraws cash under concurrent MARKET BUYs', async () => {
      // 92,585 each; 627,500 available fits exactly 6
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          place({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 100 }),
        ),
      );
      const statuses = results.map((r) => r.body.status as string);
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(statuses.filter((s) => s === 'FILLED')).toHaveLength(6);
      expect(statuses.filter((s) => s === 'REJECTED')).toHaveLength(4);

      const after = await portfolio();
      expect(after.cash.available).toBe('71990.00');
      expect(Money.of(after.cash.available).isNegative()).toBe(false);
      expect(await pamp()).toMatchObject({ quantity: 640 });
    });

    it('never oversells under concurrent MARKET SELLs', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          place({ instrumentId: PAMP, side: 'SELL', type: 'MARKET', size: 10 }),
        ),
      );
      const statuses = results.map((r) => r.body.status as string);
      expect(statuses.filter((s) => s === 'FILLED')).toHaveLength(4);
      expect(statuses.filter((s) => s === 'REJECTED')).toHaveLength(1);
      expect(await pamp()).toBeUndefined(); // fully exited
    });
  });
});
