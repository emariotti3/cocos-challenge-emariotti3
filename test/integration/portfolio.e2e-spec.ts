import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app.factory';
import { resetOrders } from '../helpers/db.reset';

describe('GET /api/v1/users/:userId/portfolio', () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
    await resetOrders(t.sequelize);
  });
  afterAll(() => t.close());

  it('returns the seed portfolio of user 1 exactly', async () => {
    const res = await api()
      .get('/api/v1/users/1/portfolio')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(res.body).toEqual({
      userId: 1,
      accountNumber: '10001',
      currency: 'ARS',
      asOf: '2023-07-14',
      totalValue: '904784.00',
      cash: { total: '753000.00', reserved: '125500.00', available: '627500.00' },
      positions: [
        {
          instrumentId: 54,
          ticker: 'METR',
          name: 'MetroGAS S.A.',
          quantity: 500,
          reservedQuantity: 0,
          availableQuantity: 500,
          lastPrice: '229.50',
          marketValue: '114750.00',
          averageCost: '250.00',
          costBasis: '125000.00',
          unrealizedPnl: '-10250.00',
          totalReturnPct: '-8.20',
          dailyReturnPct: '-1.08',
        },
        {
          instrumentId: 47,
          ticker: 'PAMP',
          name: 'Pampa Holding S.A.',
          quantity: 40,
          reservedQuantity: 0,
          availableQuantity: 40,
          lastPrice: '925.85',
          marketValue: '37034.00',
          averageCost: '930.00',
          costBasis: '37200.00',
          unrealizedPnl: '-166.00',
          totalReturnPct: '-0.45',
          dailyReturnPct: '0.44',
        },
      ],
      warnings: [
        {
          code: 'NEGATIVE_POSITION',
          instrumentId: 31,
          quantity: -10,
          detail: 'FILLED SELL quantity exceeds FILLED BUY quantity; position excluded',
        },
      ],
    });
  });

  it('returns an empty portfolio for a user without orders', async () => {
    const res = await api().get('/api/v1/users/2/portfolio').expect(200);
    expect(res.body).toEqual({
      userId: 2,
      accountNumber: '10002',
      currency: 'ARS',
      asOf: null,
      totalValue: '0.00',
      cash: { total: '0.00', reserved: '0.00', available: '0.00' },
      positions: [],
    });
  });

  it('returns 404 USER_NOT_FOUND and 400 for a malformed id', async () => {
    const missing = await api().get('/api/v1/users/999/portfolio').expect(404);
    expect(missing.body).toMatchObject({ code: 'USER_NOT_FOUND', status: 404, userId: 999 });
    const bad = await api().get('/api/v1/users/abc/portfolio').expect(400);
    expect(bad.body.errors).toEqual([{ path: 'userId', message: 'must be a positive integer' }]);
  });
});
