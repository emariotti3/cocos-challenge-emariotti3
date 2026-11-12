import type { ExecutionContext } from '@nestjs/common';
import { isLedgerMutation } from './throttling.module';

const contextFor = (method: string, path: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
  }) as unknown as ExecutionContext;

describe('isLedgerMutation', () => {
  it.each([
    ['POST', '/api/v1/users/1/orders', true],
    ['POST', '/api/v1/users/1/orders/5/cancel', true],
    ['POST', '/api/v1/users/1/cash/deposits', true],
    ['POST', '/api/v1/users/1/cash/withdrawals', true],
    ['GET', '/api/v1/users/1/orders', false],
    ['GET', '/api/v1/users/1/orders/5', false],
    ['GET', '/api/v1/users/1/portfolio', false],
    ['POST', '/api/v1/instruments', false],
    ['POST', '/api/v1/users/1/cash', false],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(isLedgerMutation(contextFor(method, path))).toBe(expected);
  });
});
