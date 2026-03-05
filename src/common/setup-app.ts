import {
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { STATUS_CODES } from 'http';
import helmet from 'helmet';
import * as express from 'express';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { validationExceptionFactory } from './factories/validation-exception.factory';
import { buildErrorResponse } from './utils/build-error-response';

const BODY_PARSER_ERROR_CODES: Record<string, string> = {
  'entity.parse.failed': 'INVALID_JSON',
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
  'entity.verify.failed': 'BODY_VERIFY_FAILED',
  'charset.unsupported': 'UNSUPPORTED_CHARSET',
  'encoding.unsupported': 'UNSUPPORTED_ENCODING',
};

export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(
    (
      err: Error & { type?: string; status?: number },
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      const code = err.type ? BODY_PARSER_ERROR_CODES[err.type] : undefined;
      if (!code) {
        next(err);
        return;
      }

      const statusCode = err.status ?? 400;
      const requestId =
        (req as unknown as Record<string, unknown>).correlationId as string | undefined ??
        (req.headers['x-request-id'] as string | undefined) ??
        'unknown';
      const body = buildErrorResponse(
        new HttpException({ message: err.message, code }, statusCode),
        req.url,
        requestId,
      );
      body.error = STATUS_CODES[statusCode] ?? 'Bad Request';

      res.status(statusCode).json(body);
    },
  );

  const nodeEnv = config.get<string>('NODE_ENV');
  app.enableCors(
    nodeEnv === 'production'
      ? {
          origin: config.get<string>('ALLOWED_ORIGIN') ?? false,
          credentials: true,
        }
      : { origin: true },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.enableShutdownHooks();
}
