import { BadRequestException, type ValidationError } from '@nestjs/common';

export interface FieldError {
  path: string;
  message: string;
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ path, message }));
    const nested = error.children?.length ? flattenValidationErrors(error.children, path) : [];
    return [...own, ...nested];
  });
}

/** Used by the global ValidationPipe so 400s carry a structured `errors[]`. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    errors: flattenValidationErrors(errors),
  });
}
