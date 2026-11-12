import type { Sequelize, Transaction } from 'sequelize';
import type { UserModel } from '../../database/models';
import { UsersRepository } from './users.repository';

describe('UsersRepository.withLock', () => {
  const transaction = { id: 'tx' } as unknown as Transaction;
  const query = jest.fn();
  const sequelize = {
    query,
    transaction: jest.fn(
      (_options: unknown, callback: (t: Transaction) => Promise<unknown>): Promise<unknown> =>
        callback(transaction),
    ),
  } as unknown as jest.Mocked<Sequelize>;
  const repository = new UsersRepository({} as unknown as typeof UserModel, sequelize);

  beforeEach(() => jest.clearAllMocks());

  it('locks the user row under READ COMMITTED and runs the work in that transaction', async () => {
    query.mockResolvedValue([{ id: 1 }]);
    const work = jest.fn().mockResolvedValue('done');

    await expect(repository.withLock(1, work)).resolves.toBe('done');

    expect(sequelize.transaction).toHaveBeenCalledWith(
      { isolationLevel: 'READ COMMITTED' },
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      expect.objectContaining({ bind: { userId: 1 }, transaction }),
    );
    expect(work).toHaveBeenCalledWith(transaction);
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/SET LOCAL lock_timeout/), {
      transaction,
    });
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/SET LOCAL statement_timeout/), {
      transaction,
    });
  });

  it.each(['55P03', '57014'])('maps a %s timeout to 503 LEDGER_BUSY', async (code) => {
    query.mockResolvedValue([{ id: 1 }]);
    const dbError = Object.assign(new Error('timeout'), { original: { code } });
    await expect(repository.withLock(1, () => Promise.reject(dbError))).rejects.toMatchObject({
      code: 'LEDGER_BUSY',
      status: 503,
    });
  });

  it('rethrows other database errors untouched', async () => {
    query.mockResolvedValue([{ id: 1 }]);
    const boom = new Error('boom');
    await expect(repository.withLock(1, () => Promise.reject(boom))).rejects.toBe(boom);
  });

  it('fails with USER_NOT_FOUND (and never runs the work) if the user row is gone', async () => {
    query.mockResolvedValue([]);
    const work = jest.fn();

    await expect(repository.withLock(42, work)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      status: 404,
    });
    expect(work).not.toHaveBeenCalled();
  });
});
