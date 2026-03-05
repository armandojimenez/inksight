import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { CustomThrottlerGuard } from '@/common/guards/custom-throttler.guard';
import { ThrottlerLimitDetail } from '@nestjs/throttler';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;

  beforeEach(() => {
    // Create an instance with minimal prototype chain — we only test throwThrottlingException
    guard = Object.create(CustomThrottlerGuard.prototype);
  });

  it('should throw HttpException with RATE_LIMIT_EXCEEDED code', async () => {
    const context = {} as ExecutionContext;
    const detail = {} as ThrottlerLimitDetail;

    await expect(
      (guard as any).throwThrottlingException(context, detail),
    ).rejects.toThrow(HttpException);
  });

  it('should use 429 status code', async () => {
    expect.assertions(2);
    const context = {} as ExecutionContext;
    const detail = {} as ThrottlerLimitDetail;

    try {
      await (guard as any).throwThrottlingException(context, detail);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('should include RATE_LIMIT_EXCEEDED in the response body', async () => {
    expect.assertions(2);
    const context = {} as ExecutionContext;
    const detail = {} as ThrottlerLimitDetail;

    try {
      await (guard as any).throwThrottlingException(context, detail);
    } catch (err) {
      const response = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.message).toContain('Too many requests');
    }
  });

  it('should extend ThrottlerGuard', () => {
    expect(
      Object.getPrototypeOf(CustomThrottlerGuard.prototype).constructor.name,
    ).toBe('ThrottlerGuard');
  });
});
