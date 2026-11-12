import type { ExecutionContext } from '@nestjs/common';
import { isOrderMutation } from './throttling.module';

const contextFor = (method: string, path: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
  }) as unknown as ExecutionContext;

describe('isOrderMutation', () => {
  it.each([
    ['POST', '/api/v1/users/1/orders', true],
    ['POST', '/api/v1/users/1/orders/5/cancel', true],
    ['GET', '/api/v1/users/1/orders', false],
    ['GET', '/api/v1/users/1/orders/5', false],
    ['GET', '/api/v1/users/1/portfolio', false],
    ['POST', '/api/v1/instruments', false],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(isOrderMutation(contextFor(method, path))).toBe(expected);
  });
});
