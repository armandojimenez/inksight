export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  backoff?: number;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const { attempts = 3, delayMs = 500, backoff = 2 } = options ?? {};

  let lastError: Error | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (i < attempts - 1) {
        const delay = delayMs * Math.pow(backoff, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
