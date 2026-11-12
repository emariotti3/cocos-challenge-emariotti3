import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { NotFoundError } from '../../../common/errors/app.error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { validationProblem } from '../../../common/errors/validation.problem';
import { parsePgIntParam } from '../../../common/validation/limits';
import { type UserRecord, UsersRepository } from '../users.repository';

export type RequestWithUser = Request & { user?: UserRecord };

/**
 * Resolves `:userId` once per request: 400 if malformed, 404 if unknown,
 * otherwise attaches the user to the request for `@RequestUser()`.
 * There is no authentication in this challenge; swapping this guard for a
 * JWT guard that populates `request.user` is the intended upgrade path.
 */
@Injectable()
export class UserExistsGuard implements CanActivate {
  constructor(private readonly users: UsersRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = parsePgIntParam(request.params['userId']);
    if (userId === null) {
      throw validationProblem([{ path: 'userId', message: 'must be a positive integer' }]);
    }
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError(ErrorCode.USER_NOT_FOUND, `User ${userId} does not exist`, {
        userId,
      });
    }
    request.user = user;
    return true;
  }
}
