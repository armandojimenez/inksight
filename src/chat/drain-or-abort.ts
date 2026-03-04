import { Response } from 'express';

export async function drainOrAbort(
  res: Response,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      res.removeListener('drain', onDrain);
      res.removeListener('close', onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const onClose = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    res.once('drain', onDrain);
    res.once('close', onClose);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
