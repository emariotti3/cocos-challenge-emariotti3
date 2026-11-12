import type { BadRequestException, ValidationError } from '@nestjs/common';
import { type FieldError, validationProblem } from '../errors/validation.problem';

export type { FieldError } from '../errors/validation.problem';

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
  return validationProblem(flattenValidationErrors(errors));
}
