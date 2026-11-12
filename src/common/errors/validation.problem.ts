import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface FieldError {
  path: string;
  message: string;
}

/**
 * The one way to raise a 400 VALIDATION_ERROR with per-field details, so the
 * ValidationPipe, route-param parsing, the user guard and the cursor decoder
 * all produce the same body.
 */
export function validationProblem(errors: FieldError[]): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Request validation failed',
    errors,
  });
}
