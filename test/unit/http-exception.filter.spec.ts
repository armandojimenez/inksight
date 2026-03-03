import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockGetRequest: jest.Mock;
  let mockGetResponse: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockGetRequest = jest.fn().mockReturnValue({
      url: '/api/test',
      method: 'GET',
      correlationId: 'test-request-id-123',
    });
    mockGetResponse = jest.fn().mockReturnValue({
      status: mockStatus,
    });

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: mockGetResponse,
      }),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ArgumentsHost;
  });

  it('should return consistent error shape for HttpException', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(404);
    const body = mockJson.mock.calls[0][0];
    expect(body).toHaveProperty('statusCode', 404);
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('path', '/api/test');
    expect(body).toHaveProperty('requestId', 'test-request-id-123');
  });

  it('should use human-readable reason phrase for error field', () => {
    const exception = new HttpException(
      'Resource not found',
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    expect(body.error).toBe('Not Found');
  });

  it('should default code to INTERNAL_ERROR for unrecognized exceptions', () => {
    const exception = new Error('Something broke');

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('should extract code from exception response if present', () => {
    const exception = new HttpException(
      { message: 'File too large', code: 'FILE_TOO_LARGE' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    expect(body.code).toBe('FILE_TOO_LARGE');
  });

  it('should read requestId from request.correlationId', () => {
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    expect(body.requestId).toBe('test-request-id-123');
  });

  it('should produce a valid ISO 8601 timestamp', () => {
    const exception = new HttpException('Error', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });

  it('should not expose stack traces in response body', () => {
    const exception = new Error('Internal failure');

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('at ');
  });

  it('should handle non-HttpException as 500', () => {
    const exception = new TypeError('Cannot read property of undefined');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = mockJson.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.error).toBe('Internal Server Error');
  });

  it('should hide raw error message in production for non-HttpException', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new Error('Connection refused at postgres://...');

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    expect(body.message).toBe('Internal Server Error');
    expect(body.message).not.toContain('postgres');

    process.env.NODE_ENV = originalEnv;
  });

  it('should show raw error message in development for non-HttpException', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const exception = new Error('Something broke');

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    expect(body.message).toBe('Something broke');

    process.env.NODE_ENV = originalEnv;
  });

  it('should fallback to x-request-id header when correlationId is absent', () => {
    mockGetRequest.mockReturnValue({
      url: '/api/test',
      method: 'GET',
      headers: { 'x-request-id': 'header-id-456' },
    });

    const exception = new HttpException('Error', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const body = mockJson.mock.calls[0][0];
    expect(body.requestId).toBe('header-id-456');
  });
});
