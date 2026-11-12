import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app.factory';

describe('GET /api/v1/instruments', () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());
  const tickers = (body: { data: { ticker: string }[] }) => body.data.map((i) => i.ticker);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('finds by ticker fragment with latest price and daily return', async () => {
    const res = await api().get('/api/v1/instruments?q=pamp').expect(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(res.body.data[0]).toEqual({
      id: 47,
      ticker: 'PAMP',
      name: 'Pampa Holding S.A.',
      type: 'ACCIONES',
      lastPrice: '925.85',
      previousClose: '921.80',
      dailyReturnPct: '0.44',
      priceDate: '2023-07-14',
    });
  });

  it('finds by name fragment, case-insensitively, ranked by similarity', async () => {
    const res = await api().get('/api/v1/instruments?q=BANCO&limit=5').expect(200);
    expect(res.body.meta.total).toBe(4);
    expect(tickers(res.body).sort()).toEqual(['BBAR', 'BHIP', 'BMA', 'BPAT']);
  });

  it('keeps reporting the total past the last page', async () => {
    const res = await api().get('/api/v1/instruments?q=BANCO&limit=3&page=9').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({ page: 9, limit: 3, total: 4 });
  });

  it('combines explicit ticker and name filters', async () => {
    const res = await api().get('/api/v1/instruments?ticker=GGAL&name=galicia').expect(200);
    expect(tickers(res.body)).toEqual(['GGAL']);
    const none = await api().get('/api/v1/instruments?ticker=GGAL&name=banco').expect(200);
    expect(none.body.meta.total).toBe(0);
  });

  it('never returns the cash instrument', async () => {
    const res = await api().get('/api/v1/instruments?q=ars').expect(200);
    expect(res.body.data).toEqual([]);
    const pesos = await api().get('/api/v1/instruments?q=pesos').expect(200);
    expect(pesos.body.data).toEqual([]);
  });

  it('treats LIKE metacharacters literally', async () => {
    const res = await api().get('/api/v1/instruments?q=%25').expect(200);
    expect(res.body.meta.total).toBe(0);
    const underscore = await api().get('/api/v1/instruments?q=_').expect(200);
    expect(underscore.body.meta.total).toBe(0);
  });

  it('lists everything tradable with pagination when no filter is given', async () => {
    const page1 = await api().get('/api/v1/instruments?limit=10').expect(200);
    expect(page1.body.meta).toEqual({ page: 1, limit: 10, total: 65 });
    expect(page1.body.data).toHaveLength(10);
    const page7 = await api().get('/api/v1/instruments?limit=10&page=7').expect(200);
    expect(page7.body.data).toHaveLength(5);
    const page8 = await api().get('/api/v1/instruments?limit=10&page=8').expect(200);
    expect(page8.body).toEqual({ data: [], meta: { page: 8, limit: 10, total: 65 } });
  });

  it('validates query parameters', async () => {
    const res = await api().get('/api/v1/instruments?limit=500').expect(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [{ path: 'limit', message: expect.any(String) }],
    });
    await api().get('/api/v1/instruments?page=0').expect(400);
    await api().get('/api/v1/instruments?foo=bar').expect(400);
    await api()
      .get(`/api/v1/instruments?q=${'a'.repeat(51)}`)
      .expect(400);
  });

  it('returns one instrument, with nulls when it has no market data', async () => {
    const pamp = await api().get('/api/v1/instruments/47').expect(200);
    expect(pamp.body).toMatchObject({ ticker: 'PAMP', lastPrice: '925.85' });
    const pgr = await api().get('/api/v1/instruments/3').expect(200);
    expect(pgr.body).toMatchObject({
      ticker: 'PGR',
      lastPrice: null,
      previousClose: null,
      dailyReturnPct: null,
      priceDate: null,
    });
    const ars = await api().get('/api/v1/instruments/66').expect(200);
    expect(ars.body).toMatchObject({ ticker: 'ARS', type: 'MONEDA' });
  });

  it('returns 404 / 400 for unknown or malformed ids', async () => {
    const missing = await api().get('/api/v1/instruments/999').expect(404);
    expect(missing.body).toMatchObject({ code: 'INSTRUMENT_NOT_FOUND', instrumentId: 999 });
    await api().get('/api/v1/instruments/abc').expect(400);
    await api().get('/api/v1/instruments/0').expect(400);
  });
});
