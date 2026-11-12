import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../errors/app.error';
import { type ProblemDetails, problemTypeFor } from '../errors/problem-details';

/** Everything from here up is logged as a server failure (`statusCode` is a plain number on the wire). */
const FIRST_SERVER_ERROR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** RFC 7807 `title`: the standard reason phrase, as Node knows it. */
const titleFor = (status: number): string => STATUS_CODES[status] ?? 'Error';

/** Stable `code` for framework-raised HttpExceptions that do not carry one. */
const CODE_BY_STATUS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.NOT_FOUND]: 'ROUTE_NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/**
 * Maps every error to an RFC 7807 problem+json body. Domain errors (AppError)
 * and Nest HttpExceptions keep their status; anything else is a 500 and the
 * original error is logged but never leaked to the client.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: unknown }>();

    const problem = this.toProblem(exception, request);

    if (problem.status >= FIRST_SERVER_ERROR) {
      this.logger.error(
        { err: exception, requestId: problem.requestId, path: request.url },
        'Unhandled error while processing request',
      );
    }

    response.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(exception: unknown, request: Request & { id?: unknown }): ProblemDetails {
    const requestId = typeof request.id === 'string' ? request.id : undefined;
    const instance = request.originalUrl || request.url;

    if (exception instanceof AppError) {
      return {
        // extension members first so they can never shadow the standard ones
        ...(exception.details ?? {}),
        type: problemTypeFor(exception.code),
        title: titleFor(exception.status),
        status: exception.status,
        detail: exception.message,
        instance,
        code: exception.code,
        requestId,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const fromBody =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const code =
        typeof fromBody['code'] === 'string'
          ? fromBody['code']
          : (CODE_BY_STATUS[status as HttpStatus] ?? 'HTTP_ERROR');
      const detail =
        typeof body === 'string'
          ? body
          : Array.isArray(fromBody['message'])
            ? (fromBody['message'] as string[]).join('; ')
            : typeof fromBody['message'] === 'string'
              ? fromBody['message']
              : exception.message;
      const errors = Array.isArray(fromBody['errors'])
        ? (fromBody['errors'] as ProblemDetails['errors'])
        : undefined;

      return {
        type: problemTypeFor(code),
        title: titleFor(status),
        status,
        detail,
        instance,
        code,
        ...(errors ? { errors } : {}),
        requestId,
      };
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    return {
      type: problemTypeFor('INTERNAL_ERROR'),
      title: titleFor(status),
      status,
      detail: 'An unexpected error occurred',
      instance,
      code: 'INTERNAL_ERROR',
      requestId,
    };
  }
}
