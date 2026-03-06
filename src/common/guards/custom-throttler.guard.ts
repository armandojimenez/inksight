import { Injectable, HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      {
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
