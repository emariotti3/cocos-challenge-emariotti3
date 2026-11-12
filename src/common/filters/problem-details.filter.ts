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

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'ROUTE_NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
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

    if (problem.status >= 500) {
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
        title: STATUS_TITLES[exception.status] ?? 'Error',
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
          : (CODE_BY_STATUS[status] ?? 'HTTP_ERROR');
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
        title: STATUS_TITLES[status] ?? 'Error',
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
      title: STATUS_TITLES[status] ?? 'Error',
      status,
      detail: 'An unexpected error occurred',
      instance,
      code: 'INTERNAL_ERROR',
      requestId,
    };
  }
}
