import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConcurrentSseGuard } from '@/common/guards/concurrent-sse.guard';
import { EventEmitter } from 'events';

function createMockContext(ip = '127.0.0.1') {
  const res = new EventEmitter();
  const req = { ip };
  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext,
    req,
    res,
  };
}

describe('ConcurrentSseGuard', () => {
  let guard: ConcurrentSseGuard;
  let configService: ConfigService;

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(2) } as unknown as ConfigService;
    guard = new ConcurrentSseGuard(configService);
  });

  it('should allow connections within the limit', () => {
    const { context } = createMockContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow up to the configured max per IP', () => {
    const mock1 = createMockContext('10.0.0.1');
    const mock2 = createMockContext('10.0.0.1');
    expect(guard.canActivate(mock1.context)).toBe(true);
    expect(guard.canActivate(mock2.context)).toBe(true);
  });

  it('should reject when limit is exceeded', () => {
    const mock1 = createMockContext('10.0.0.1');
    const mock2 = createMockContext('10.0.0.1');
    const mock3 = createMockContext('10.0.0.1');

    guard.canActivate(mock1.context);
    guard.canActivate(mock2.context);

    expect(() => guard.canActivate(mock3.context)).toThrow(HttpException);
    try {
      guard.canActivate(mock3.context);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const response = (err as HttpException).getResponse() as Record<string, unknown>;
      expect(response.code).toBe('SSE_CONNECTION_LIMIT');
    }
  });

  it('should allow new connections after previous ones close', () => {
    const mock1 = createMockContext('10.0.0.1');
    const mock2 = createMockContext('10.0.0.1');

    guard.canActivate(mock1.context);
    guard.canActivate(mock2.context);

    // Close one connection
    mock1.res.emit('close');

    const mock3 = createMockContext('10.0.0.1');
    expect(guard.canActivate(mock3.context)).toBe(true);
  });

  it('should track different IPs independently', () => {
    const mockA1 = createMockContext('10.0.0.1');
    const mockA2 = createMockContext('10.0.0.1');
    const mockB1 = createMockContext('10.0.0.2');

    guard.canActivate(mockA1.context);
    guard.canActivate(mockA2.context);
    expect(guard.canActivate(mockB1.context)).toBe(true);
  });

  it('should not decrement below zero on double close', () => {
    const mock = createMockContext('10.0.0.1');
    guard.canActivate(mock.context);

    mock.res.emit('close');
    mock.res.emit('close');

    // Should still allow new connections
    const mock2 = createMockContext('10.0.0.1');
    expect(guard.canActivate(mock2.context)).toBe(true);
  });

  it('should use default limit of 5 when config is not set', () => {
    const defaultConfig = {
      get: jest.fn().mockReturnValue(5),
    } as unknown as ConfigService;
    const defaultGuard = new ConcurrentSseGuard(defaultConfig);

    for (let i = 0; i < 5; i++) {
      const mock = createMockContext('10.0.0.1');
      expect(defaultGuard.canActivate(mock.context)).toBe(true);
    }

    const overLimit = createMockContext('10.0.0.1');
    expect(() => defaultGuard.canActivate(overLimit.context)).toThrow(
      HttpException,
    );
  });
});
