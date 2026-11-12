import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app.factory';

describe('Operational endpoints', () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('exposes liveness without touching dependencies', async () => {
    await api().get('/health/live').expect(200).expect({ status: 'ok' });
  });

  it('exposes readiness with a database check', async () => {
    const res = await api().get('/health/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', details: { database: { status: 'up' } } });
    await api().get('/health').expect(200);
  });

  it('keeps operational routes outside the API prefix', async () => {
    await api().get('/api/v1/health').expect(404);
  });

  it('answers unknown routes with problem+json and echoes a client request id', async () => {
    const res = await api()
      .get('/api/v1/nope')
      .set('x-request-id', 'test-request-123')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: '/problems/route-not-found',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/nope',
      code: 'ROUTE_NOT_FOUND',
      requestId: 'test-request-123',
    });
    expect(res.headers['x-request-id']).toBe('test-request-123');
  });

  it('exposes Prometheus metrics with the text exposition content type', async () => {
    await api().get('/api/v1/users/1/portfolio').expect(200);
    const res = await api().get('/metrics').expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain;.*version=0\.0\.4/);
    expect(res.text).toContain('# TYPE http_server_request_duration_seconds histogram');
    expect(res.text).toMatch(/route="\/api\/v1\/users\/:userId\/portfolio"/);
    expect(res.text).toContain('db_pool_connections{');
    expect(res.text).toContain('orders_placed_total');
  });

  it('sets security headers and hides the server stack', async () => {
    const res = await api().get('/health/live').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});
