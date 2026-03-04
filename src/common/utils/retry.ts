export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  backoff?: number;
  /** Return false to skip retrying for non-transient errors (e.g. constraint violations). */
  shouldRetry?: (err: Error) => boolean;
}

/**
 * PostgreSQL error codes in the 23xxx range are integrity constraint violations
 * (unique, FK, check, etc.) — these will never succeed on retry.
 */
function isTransientByDefault(err: Error): boolean {
  const pgCode = (err as Error & { code?: string }).code;
  if (typeof pgCode === 'string' && pgCode.startsWith('23')) return false;
  return true;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const {
    attempts = 3,
    delayMs = 500,
    backoff = 2,
    shouldRetry = isTransientByDefault,
  } = options ?? {};

  if (attempts < 1) {
    throw new Error('withRetry: attempts must be at least 1');
  }

  let lastError: Error | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (i < attempts - 1 && shouldRetry(lastError)) {
        const delay = delayMs * Math.pow(backoff, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (!shouldRetry(lastError)) {
        throw lastError;
      }
    }
  }

  throw lastError;
}
