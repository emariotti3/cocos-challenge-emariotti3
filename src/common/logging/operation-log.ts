import type { Logger } from '@nestjs/common';
import { AppError } from '../errors/app.error';

/**
 * Uniform failure logging for sensitive operations (anything that moves cash
 * or shares). Expected domain outcomes (AppError: 404/409/422) are logged at
 * debug with their code, because they are part of the contract and would
 * otherwise flood the error log; anything else is a real failure and is
 * logged at error with the full stack and the business context so it can be
 * reconciled later.
 */
export function logOperationFailure(
  logger: Logger,
  operation: string,
  context: Record<string, unknown>,
  error: unknown,
): void {
  if (error instanceof AppError) {
    logger.debug(
      { ...context, code: error.code, status: error.status },
      `${operation} refused: ${error.message}`,
    );
    return;
  }
  logger.error({ err: error, ...context }, `${operation} failed`);
}
