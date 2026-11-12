import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { isPgInt } from '../validation/limits';

/** Parses a route/query param as a positive int4 (ids are INTEGER columns); 400 VALIDATION_ERROR otherwise. */
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  constructor(private readonly paramName: string) {}

  transform(value: string): number {
    if (!/^[1-9]\d{0,9}$/.test(value) || !isPgInt(Number(value))) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors: [{ path: this.paramName, message: 'must be a positive integer' }],
      });
    }
    return Number(value);
  }
}
