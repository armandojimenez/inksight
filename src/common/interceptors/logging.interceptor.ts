import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';
import { Request, Response } from 'express';

interface RequestWithCorrelation extends Request {
  correlationId?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<RequestWithCorrelation>();
    const response = ctx.getResponse<Response>();

    const requestId =
      (request.headers['x-request-id'] as string | undefined) ?? uuid();
    request.correlationId = requestId;
    response.setHeader('X-Request-Id', requestId);

    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.log(
          `[${requestId}] ${method} ${url} — ${response.statusCode} — ${duration}ms`,
        );
      }),
      catchError((error: Error) => {
        const duration = Date.now() - start;
        this.logger.error(
          `[${requestId}] ${method} ${url} — ERROR — ${duration}ms — ${error.message}`,
        );
        throw error;
      }),
    );
  }
}
