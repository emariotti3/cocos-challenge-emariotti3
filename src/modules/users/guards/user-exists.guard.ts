import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { NotFoundError } from '../../../common/errors/app.error';
import { isPgInt } from '../../../common/validation/limits';
import { type UserRecord, UsersRepository } from '../users.repository';

export type RequestWithUser = Request & { user?: UserRecord };

const POSITIVE_INT = /^[1-9]\d{0,9}$/;

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
    const raw = request.params['userId'];
    if (typeof raw !== 'string' || !POSITIVE_INT.test(raw) || !isPgInt(Number(raw))) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors: [{ path: 'userId', message: 'must be a positive integer' }],
      });
    }
    const userId = Number(raw);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', `User ${userId} does not exist`, { userId });
    }
    request.user = user;
    return true;
  }
}
