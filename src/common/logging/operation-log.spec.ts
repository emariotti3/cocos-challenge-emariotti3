import type { Logger } from '@nestjs/common';
import { ConflictError } from '../errors/app.error';
import { logOperationFailure } from './operation-log';

describe('logOperationFailure', () => {
  const logger = { debug: jest.fn(), error: jest.fn() } as unknown as jest.Mocked<Logger>;
  beforeEach(() => jest.clearAllMocks());

  it('logs expected domain errors at debug with their code', () => {
    logOperationFailure(
      logger,
      'Order cancellation',
      { userId: 1, orderId: 2 },
      new ConflictError('ORDER_NOT_CANCELLABLE', 'Order 2 is FILLED'),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { userId: 1, orderId: 2, code: 'ORDER_NOT_CANCELLABLE', status: 409 },
      'Order cancellation refused: Order 2 is FILLED',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected failures at error with the stack and the business context', () => {
    const boom = new Error('connection reset');
    logOperationFailure(logger, 'Order placement', { userId: 1, side: 'BUY' }, boom);
    expect(logger.error).toHaveBeenCalledWith(
      { err: boom, userId: 1, side: 'BUY' },
      'Order placement failed',
    );
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
