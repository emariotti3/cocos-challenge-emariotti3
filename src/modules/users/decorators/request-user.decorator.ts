import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from '../guards/user-exists.guard';
import type { UserRecord } from '../users.repository';

/** The user resolved by UserExistsGuard. Only valid on guarded routes. */
export const RequestUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserRecord => {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw new Error('RequestUser used on a route without UserExistsGuard');
    return user;
  },
);
