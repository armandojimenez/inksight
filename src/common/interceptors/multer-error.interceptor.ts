import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Observable, catchError } from 'rxjs';
import { MulterError } from 'multer';

/**
 * Intercepts Multer errors thrown during file upload and converts them
 * to application-specific exceptions with proper error codes.
 *
 * NestJS wraps MulterError into HttpExceptions, but we need to
 * handle the original MulterError to map its `code` field to our
 * application error codes.
 *
 * This interceptor catches those wrapped exceptions and rethrows with
 * the correct status code and error code.
 */
@Injectable()
export class MulterErrorInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof MulterError) {
          switch (error.code) {
            case 'LIMIT_FILE_SIZE':
              throw new PayloadTooLargeException({
                message: 'File size exceeds the maximum allowed limit',
                code: 'FILE_TOO_LARGE',
              });
            case 'LIMIT_UNEXPECTED_FILE':
              throw new BadRequestException({
                message: `No file provided. Use field name "image"`,
                code: 'MISSING_FILE',
              });
            default:
              throw new BadRequestException({
                message: error.message,
                code: 'UPLOAD_ERROR',
              });
          }
        }

        // Check if NestJS already wrapped a MulterError into an HttpException
        if (
          error instanceof BadRequestException ||
          error instanceof PayloadTooLargeException
        ) {
          const response = error.getResponse();
          if (typeof response === 'object' && response !== null) {
            const msg =
              (response as Record<string, unknown>).message ?? error.message;
            const messageStr = Array.isArray(msg) ? msg.join(', ') : String(msg);

            if (messageStr.includes('Unexpected field')) {
              throw new BadRequestException({
                message: `No file provided. Use field name "image"`,
                code: 'MISSING_FILE',
              });
            }
            if (messageStr.includes('File too large')) {
              throw new PayloadTooLargeException({
                message: 'File size exceeds the maximum allowed limit',
                code: 'FILE_TOO_LARGE',
              });
            }
          }
        }

        throw error;
      }),
    );
  }
}
