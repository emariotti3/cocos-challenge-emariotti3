import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { type NotFoundError } from '../../../common/errors/app.error';
import type { UsersRepository } from '../users.repository';
import { UserExistsGuard } from './user-exists.guard';

describe('UserExistsGuard', () => {
  const users = { findById: jest.fn() } as unknown as jest.Mocked<UsersRepository>;
  const guard = new UserExistsGuard(users);

  const contextFor = (userId: unknown) => {
    const request = { params: { userId } } as Record<string, unknown>;
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };

  it('attaches the user and allows the request', async () => {
    users.findById.mockResolvedValue({ id: 1, email: 'emiliano@test.com', accountNumber: '10001' });
    const { context, request } = contextFor('1');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request['user']).toMatchObject({ id: 1 });
  });

  it.each(['0', '-1', 'abc', '1.5', ''])('rejects malformed id %p with 400', async (raw) => {
    await expect(guard.canActivate(contextFor(raw).context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('throws USER_NOT_FOUND for unknown users', async () => {
    users.findById.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor('999').context)).rejects.toMatchObject(
      expect.objectContaining({ code: 'USER_NOT_FOUND', status: 404 }) as NotFoundError,
    );
  });
});
