import {
  BadRequestException,
  PayloadTooLargeException,
  CallHandler,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { MulterErrorInterceptor } from '@/common/interceptors/multer-error.interceptor';

describe('MulterErrorInterceptor', () => {
  let interceptor: MulterErrorInterceptor;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    interceptor = new MulterErrorInterceptor();
    mockContext = {} as ExecutionContext;
  });

  function createCallHandler(error?: Error): CallHandler {
    return {
      handle: () => (error ? throwError(() => error) : of(undefined)),
    };
  }

  it('should pass through successful responses', async () => {
    const handler = { handle: () => of({ data: 'test' }) } as CallHandler;
    const result = await firstValueFrom(
      interceptor.intercept(mockContext, handler),
    );
    expect(result).toEqual({ data: 'test' });
  });

  it('should map "Unexpected field" BadRequestException to MISSING_FILE', async () => {
    const error = new BadRequestException('Unexpected field');
    const handler = createCallHandler(error);

    await expect(
      firstValueFrom(interceptor.intercept(mockContext, handler)),
    ).rejects.toThrow(BadRequestException);

    try {
      await firstValueFrom(interceptor.intercept(mockContext, handler));
    } catch (e) {
      const response = (e as BadRequestException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('MISSING_FILE');
      expect(response.message).toBe('No file provided. Use field name "image"');
    }
  });

  it('should map "File too large" PayloadTooLargeException to FILE_TOO_LARGE', async () => {
    const error = new PayloadTooLargeException('File too large');
    const handler = createCallHandler(error);

    await expect(
      firstValueFrom(interceptor.intercept(mockContext, handler)),
    ).rejects.toThrow(PayloadTooLargeException);

    try {
      await firstValueFrom(interceptor.intercept(mockContext, handler));
    } catch (e) {
      const response = (e as PayloadTooLargeException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('FILE_TOO_LARGE');
      expect(response.message).toBe(
        'File size exceeds the maximum allowed limit',
      );
    }
  });

  it('should handle message array from wrapped errors', async () => {
    const error = new BadRequestException({
      message: ['Unexpected field'],
    });
    const handler = createCallHandler(error);

    try {
      await firstValueFrom(interceptor.intercept(mockContext, handler));
    } catch (e) {
      const response = (e as BadRequestException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('MISSING_FILE');
    }
  });

  it('should pass through unrelated BadRequestException', async () => {
    const error = new BadRequestException({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    });
    const handler = createCallHandler(error);

    await expect(
      firstValueFrom(interceptor.intercept(mockContext, handler)),
    ).rejects.toThrow(BadRequestException);

    try {
      await firstValueFrom(interceptor.intercept(mockContext, handler));
    } catch (e) {
      const response = (e as BadRequestException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.message).toBe('Validation failed');
      expect(response.code).toBe('VALIDATION_ERROR');
    }
  });

  it('should pass through non-HttpException errors', async () => {
    const error = new Error('Database connection lost');
    const handler = createCallHandler(error);

    await expect(
      firstValueFrom(interceptor.intercept(mockContext, handler)),
    ).rejects.toThrow('Database connection lost');
  });

  it('should pass through other HttpException types', async () => {
    const error = new InternalServerErrorException('Server error');
    const handler = createCallHandler(error);

    await expect(
      firstValueFrom(interceptor.intercept(mockContext, handler)),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
