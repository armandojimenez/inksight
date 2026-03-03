import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockSetHeader: jest.Mock;
  let mockRequest: Record<string, unknown>;
  let mockResponse: Record<string, unknown>;
  let mockContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();

    mockSetHeader = jest.fn();
    mockRequest = {
      headers: {},
      method: 'GET',
      url: '/api/test',
    };
    mockResponse = {
      setHeader: mockSetHeader,
      statusCode: 200,
    };

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getClass: jest.fn(),
      getHandler: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ExecutionContext;

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('result')),
    };
  });

  it('should generate a UUID when no X-Request-Id header is provided', (done) => {
    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      complete: () => {
        expect(mockRequest.correlationId).toBeDefined();
        expect(mockRequest.correlationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        done();
      },
    });
  });

  it('should honor a valid incoming X-Request-Id header', (done) => {
    mockRequest.headers = { 'x-request-id': 'my-custom-id-123' };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      complete: () => {
        expect(mockRequest.correlationId).toBe('my-custom-id-123');
        expect(mockSetHeader).toHaveBeenCalledWith(
          'X-Request-Id',
          'my-custom-id-123',
        );
        done();
      },
    });
  });

  it('should reject invalid X-Request-Id and generate a new UUID', (done) => {
    mockRequest.headers = {
      'x-request-id': 'invalid\nheader\ninjection',
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      complete: () => {
        expect(mockRequest.correlationId).not.toBe(
          'invalid\nheader\ninjection',
        );
        expect(mockRequest.correlationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        done();
      },
    });
  });

  it('should reject overly long X-Request-Id', (done) => {
    mockRequest.headers = { 'x-request-id': 'a'.repeat(200) };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      complete: () => {
        expect(mockRequest.correlationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        done();
      },
    });
  });

  it('should set X-Request-Id on the response', (done) => {
    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      complete: () => {
        expect(mockSetHeader).toHaveBeenCalledWith(
          'X-Request-Id',
          expect.any(String),
        );
        done();
      },
    });
  });

  it('should re-throw errors from the handler', (done) => {
    const error = new Error('Handler failed');
    mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      error: (err: Error) => {
        expect(err).toBe(error);
        expect(err.message).toBe('Handler failed');
        done();
      },
    });
  });
});
