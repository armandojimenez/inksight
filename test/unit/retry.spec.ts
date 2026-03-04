import { withRetry } from '@/common/utils/retry';

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return result on first success', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const result = await withRetry(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient error then succeed', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('recovered');

    const promise = withRetry(operation);
    await jest.advanceTimersByTimeAsync(500); // default delayMs

    const result = await promise;
    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw last error after max attempts', async () => {
    const error = new Error('persistent failure');
    const operation = jest.fn().mockRejectedValue(error);

    const promise = withRetry(operation, { attempts: 3 });
    await jest.advanceTimersByTimeAsync(500);  // delay after attempt 1
    await jest.advanceTimersByTimeAsync(1000); // delay after attempt 2

    await expect(promise).rejects.toThrow('persistent failure');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(operation, { attempts: 3 });

    // After attempt 1: delay = 500 * 2^0 = 500ms
    await jest.advanceTimersByTimeAsync(499);
    expect(operation).toHaveBeenCalledTimes(1); // not yet retried
    await jest.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(2); // retried after 500ms

    // After attempt 2: delay = 500 * 2^1 = 1000ms
    await jest.advanceTimersByTimeAsync(999);
    expect(operation).toHaveBeenCalledTimes(2); // not yet retried
    await jest.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(3); // retried after 1000ms

    await expect(promise).rejects.toThrow('fail');
  });

  it('should use default options when none provided', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(operation);

    // Default: 3 attempts, 500ms delay, backoff 2
    await jest.advanceTimersByTimeAsync(500);  // after attempt 1
    await jest.advanceTimersByTimeAsync(1000); // after attempt 2

    await expect(promise).rejects.toThrow('fail');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should accept custom attempts/delayMs/backoff', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(operation, {
      attempts: 5,
      delayMs: 100,
      backoff: 3,
    });

    // Delays: 100, 300, 900, 2700
    await jest.advanceTimersByTimeAsync(100);  // after attempt 1
    expect(operation).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(300);  // after attempt 2
    expect(operation).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(900);  // after attempt 3
    expect(operation).toHaveBeenCalledTimes(4);

    await jest.advanceTimersByTimeAsync(2700); // after attempt 4
    expect(operation).toHaveBeenCalledTimes(5);

    await expect(promise).rejects.toThrow('fail');
  });

  it('should not delay after final failed attempt', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    const start = Date.now();
    const promise = withRetry(operation, { attempts: 2 });

    // Only one delay: 500ms between attempt 1 and 2
    await jest.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toThrow('fail');

    // Total elapsed should be ~500ms (one delay), not 1500ms (two delays)
    const elapsed = Date.now() - start;
    expect(elapsed).toBe(500);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
