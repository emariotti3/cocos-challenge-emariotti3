import { Injectable, type PipeTransform } from '@nestjs/common';
import { validationProblem } from '../errors/validation.problem';
import { parsePgIntParam } from '../validation/limits';

/** Parses a route/query param as a positive int4 (ids are INTEGER columns); 400 VALIDATION_ERROR otherwise. */
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  constructor(private readonly paramName: string) {}

  transform(value: string): number {
    const parsed = parsePgIntParam(value);
    if (parsed === null) {
      throw validationProblem([{ path: this.paramName, message: 'must be a positive integer' }]);
    }
    return parsed;
  }
}
