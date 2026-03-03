import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { STATUS_CODES } from 'http';
import { Response } from 'express';
import { RequestWithCorrelation } from '../interfaces/request.interface';

interface ExceptionResponseObject {
  message?: string;
  code?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithCorrelation>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const error = STATUS_CODES[status] ?? 'Internal Server Error';

    let message = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        const responseObj = exceptionResponse as ExceptionResponseObject;
        message = responseObj.message ?? exception.message;
        if (responseObj.code) {
          code = responseObj.code;
        } else {
          code = error.toUpperCase().replace(/\s+/g, '_');
        }
      }
    } else if (exception instanceof Error) {
      message =
        process.env.NODE_ENV === 'production'
          ? 'Internal Server Error'
          : exception.message;
    }

    const requestId =
      request.correlationId ??
      (request.headers?.['x-request-id'] as string | undefined) ??
      'unknown';

    response.status(status).json({
      statusCode: status,
      error,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }
}
