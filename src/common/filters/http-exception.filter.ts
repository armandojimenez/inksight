import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
} from '@nestjs/common';
import { Response } from 'express';
import { RequestWithCorrelation } from '../interfaces/request.interface';
import { buildErrorResponse } from '../utils/build-error-response';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithCorrelation>();
    const response = ctx.getResponse<Response>();

    const requestId =
      request.correlationId ??
      (request.headers?.['x-request-id'] as string | undefined) ??
      'unknown';

    const body = buildErrorResponse(exception, request.url, requestId);

    response.status(body.statusCode).json(body);
  }
}
