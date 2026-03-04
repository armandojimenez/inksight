import { EventEmitter } from 'events';
import { drainOrAbort } from '@/chat/drain-or-abort';
import { Response } from 'express';

function mockResponse(): Response & EventEmitter {
  return new EventEmitter() as Response & EventEmitter;
}

describe('drainOrAbort', () => {
  it('should reject immediately when signal is already aborted', async () => {
    const res = mockResponse();
    const ac = new AbortController();
    ac.abort();

    await expect(drainOrAbort(res, ac.signal)).rejects.toThrow('Aborted');
  });

  it('should resolve when drain fires before abort', async () => {
    const res = mockResponse();
    const ac = new AbortController();

    const promise = drainOrAbort(res, ac.signal);

    // Simulate drain event
    res.emit('drain');

    await expect(promise).resolves.toBeUndefined();

    // Verify cleanup: abort listener removed (abort should not cause rejection)
    ac.abort(); // should not throw or cause issues
  });

  it('should reject when abort fires before drain', async () => {
    const res = mockResponse();
    const ac = new AbortController();

    const promise = drainOrAbort(res, ac.signal);

    // Abort before drain
    ac.abort();

    await expect(promise).rejects.toThrow('Aborted');

    // Verify cleanup: drain listener removed
    expect(res.listenerCount('drain')).toBe(0);
  });

  it('should reject when response close fires (connection dropped)', async () => {
    const res = mockResponse();
    const ac = new AbortController();

    const promise = drainOrAbort(res, ac.signal);

    // Simulate connection close
    res.emit('close');

    await expect(promise).rejects.toThrow('Aborted');

    // Verify all listeners cleaned up
    expect(res.listenerCount('drain')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('should clean up all listeners after drain resolves', async () => {
    const res = mockResponse();
    const ac = new AbortController();

    const promise = drainOrAbort(res, ac.signal);
    res.emit('drain');
    await promise;

    expect(res.listenerCount('drain')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('should clean up all listeners after abort rejects', async () => {
    const res = mockResponse();
    const ac = new AbortController();

    const promise = drainOrAbort(res, ac.signal);
    ac.abort();
    await promise.catch(() => {});

    expect(res.listenerCount('drain')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });
});
