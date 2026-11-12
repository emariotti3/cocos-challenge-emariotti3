import { HttpStatus } from '@nestjs/common';

/**
 * Base class for domain/application errors. The global ProblemDetailsFilter
 * maps these to RFC 7807 responses using `status`, `code` and `message`.
 */
export class AppError extends Error {
  constructor(
    readonly status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(HttpStatus.NOT_FOUND, code, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(HttpStatus.CONFLICT, code, message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(HttpStatus.SERVICE_UNAVAILABLE, code, message, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
  }
}
