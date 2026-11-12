import request from 'supertest';
import { Money } from '../../src/common/money/money';
import { createTestApp, type TestApp } from '../helpers/app.factory';
import { countOrders, resetOrders } from '../helpers/db.reset';

const PAMP = 47;
const ARS = 66;

/**
 * Deposits (CASH_IN) and withdrawals (CASH_OUT). They are `orders` rows on the
 * ARS instrument, exactly like the seed, so every assertion goes through the
 * public portfolio and order endpoints.
 */
describe('Cash API', () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());
  const deposit = (body: Record<string, unknown>, userId = 1) =>
    api().post(`/api/v1/users/${userId}/cash/deposits`).send(body);
  const withdraw = (body: Record<string, unknown>, userId = 1) =>
    api().post(`/api/v1/users/${userId}/cash/withdrawals`).send(body);
  const placeOrder = (body: Record<string, unknown>) =>
    api().post('/api/v1/users/1/orders').send(body);
  const cash = async (userId = 1) => {
    const res = await api().get(`/api/v1/users/${userId}/portfolio`).expect(200);
    return res.body as {
      totalValue: string;
      cash: { total: string; reserved: string; available: string };
    };
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetOrders(t.sequelize));

  describe('deposits', () => {
    it('records a CASH_IN order on ARS at price 1 and credits the cash immediately', async () => {
      const res = await deposit({ amount: 100000 }).expect(201);
      expect(res.body).toMatchObject({
        id: 12,
        userId: 1,
        instrumentId: ARS,
        ticker: 'ARS',
        side: 'CASH_IN',
        type: 'MARKET',
        status: 'FILLED',
        size: 100000,
        price: '1.00',
        notional: '100000.00',
        rejectionReason: null,
      });

      const after = await cash();
      expect(after.cash).toEqual({
        total: '853000.00',
        reserved: '125500.00',
        available: '727500.00',
      });
      expect(after.totalValue).toBe('1004784.00');
    });

    it('works for a user with no history', async () => {
      await deposit({ amount: 500 }, 2).expect(201);
      expect((await cash(2)).cash).toEqual({
        total: '500.00',
        reserved: '0.00',
        available: '500.00',
      });
    });
  });

  describe('withdrawals', () => {
    it('fills a withdrawal up to the available cash (reserved cash cannot leave)', async () => {
      const res = await withdraw({ amount: 627500 }).expect(201);
      expect(res.body).toMatchObject({
        side: 'CASH_OUT',
        status: 'FILLED',
        size: 627500,
        price: '1.00',
        notional: '627500.00',
      });
      expect((await cash()).cash).toEqual({
        total: '125500.00',
        reserved: '125500.00',
        available: '0.00',
      });
    });

    it('persists a REJECTED withdrawal above the available cash and leaves balances untouched', async () => {
      const res = await withdraw({ amount: 627501 }).expect(201);
      expect(res.body).toMatchObject({
        side: 'CASH_OUT',
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_FUNDS',
      });
      expect((await cash()).cash.total).toBe('753000.00');

      const history = await api().get('/api/v1/users/1/orders?side=CASH_OUT').expect(200);
      const historyIds = (history.body as { data: { id: number }[] }).data.map((o) => o.id);
      expect(historyIds).toEqual([res.body.id, 8]);

      // a cash movement is never NEW, so it can never be cancelled
      await api().post(`/api/v1/users/1/orders/${res.body.id}/cancel`).expect(409);
    });

    it('frees cash for withdrawal when a pending LIMIT BUY is cancelled', async () => {
      await withdraw({ amount: 650000 })
        .expect(201)
        .expect((res) => expect(res.body.status).toBe('REJECTED'));
      await api().post('/api/v1/users/1/orders/5/cancel').expect(200); // releases 35,500
      await withdraw({ amount: 650000 })
        .expect(201)
        .expect((res) => expect(res.body.status).toBe('FILLED'));
      expect((await cash()).cash.available).toBe('13000.00');
    });
  });

  describe('request validation (400, nothing persisted)', () => {
    it.each<[string, Record<string, unknown>, string]>([
      ['missing amount', {}, 'amount'],
      ['zero', { amount: 0 }, 'amount'],
      ['negative', { amount: -1 }, 'amount'],
      ['fractional (whole ARS only)', { amount: 1.5 }, 'amount'],
      ['string', { amount: '1000' }, 'amount'],
      ['too large', { amount: 2_000_000_001 }, 'amount'],
      ['unknown field', { amount: 10, side: 'CASH_IN' }, 'side'],
    ])('%s', async (_name, body, path) => {
      for (const send of [deposit, withdraw]) {
        const res = await send(body)
          .expect(400)
          .expect('Content-Type', /application\/problem\+json/);
        expect(res.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
        expect(res.body.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ path })]),
        );
      }
      expect(await countOrders(t.sequelize)).toBe(11);
    });

    it('returns 404 USER_NOT_FOUND for an unknown user', async () => {
      const res = await deposit({ amount: 1 }, 999).expect(404);
      expect(res.body.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('cash movements are not reachable through the orders endpoint', () => {
    it.each(['CASH_IN', 'CASH_OUT'])(
      'refuses side %s with 400 and points to the cash endpoints',
      async (side) => {
        const res = await placeOrder({ instrumentId: PAMP, side, type: 'MARKET', size: 1 }).expect(
          400,
        );
        expect(res.body.code).toBe('VALIDATION_ERROR');
        const sideError = (res.body.errors as { path: string; message: string }[]).find(
          (e) => e.path === 'side',
        );
        expect(sideError?.message).toMatch(/cash\/deposits/);
        expect(await countOrders(t.sequelize)).toBe(11);
      },
    );

    it('refuses to trade the ARS instrument itself with 422 NOT_TRADABLE', async () => {
      const res = await placeOrder({
        instrumentId: ARS,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      }).expect(422);
      expect(res.body).toMatchObject({ code: 'NOT_TRADABLE', instrumentId: ARS });
      expect(res.body.detail).toMatch(/cash endpoints/);
      expect(await countOrders(t.sequelize)).toBe(11);
    });
  });

  describe('concurrency', () => {
    it('never overdraws under concurrent withdrawals', async () => {
      // 100,000 each; 627,500 available fits exactly 6
      const results = await Promise.all(
        Array.from({ length: 10 }, () => withdraw({ amount: 100000 })),
      );
      const statuses = results.map((r) => r.body.status as string);
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(statuses.filter((s) => s === 'FILLED')).toHaveLength(6);
      expect(statuses.filter((s) => s === 'REJECTED')).toHaveLength(4);
      expect((await cash()).cash.available).toBe('27500.00');
    });

    it('serializes withdrawals and MARKET BUYs competing for the same pesos', async () => {
      const results = await Promise.all([
        ...Array.from({ length: 5 }, () => withdraw({ amount: 100000 })),
        ...Array.from({ length: 5 }, () =>
          placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 100 }),
        ),
      ]);
      expect(results.every((r) => r.status === 201)).toBe(true);
      const filledNotional = results
        .filter((r) => r.body.status === 'FILLED')
        .reduce((sum, r) => sum.plus(Money.of(r.body.notional as string)), Money.of('0'));
      // 10 movements of ~100k against 627,500: some must be rejected, the rest never exceed the cash
      expect(results.some((r) => r.body.status === 'REJECTED')).toBe(true);
      expect(filledNotional.gt(Money.of('627500'))).toBe(false);

      const after = await cash();
      expect(Money.of(after.cash.available).isNegative()).toBe(false);
      expect(Money.of('627500').minus(filledNotional).toFixed()).toBe(after.cash.available);
    });
  });
});
