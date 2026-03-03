import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Observable, catchError } from 'rxjs';

/**
 * Intercepts NestJS-wrapped Multer errors and converts them to
 * application-specific exceptions with proper error codes.
 *
 * NestJS wraps MulterError into HttpExceptions before they reach the
 * RxJS observable pipeline, so we match on the wrapped message content
 * rather than instanceof MulterError. This is intentional — the Multer
 * error strings ("Unexpected field", "File too large") are stable across
 * Multer versions and are the only reliable signal at this layer.
 */
@Injectable()
export class MulterErrorInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error) => {
        if (
          error instanceof BadRequestException ||
          error instanceof PayloadTooLargeException
        ) {
          const response = error.getResponse();
          if (typeof response === 'object' && response !== null) {
            const msg =
              (response as Record<string, unknown>).message ?? error.message;
            const messageStr = Array.isArray(msg)
              ? msg.join(', ')
              : String(msg);

            if (messageStr.includes('Unexpected field')) {
              throw new BadRequestException({
                message: 'No file provided. Use field name "image"',
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
