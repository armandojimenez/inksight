import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

describe('useScrollReveal', () => {
  let observeSpy: ReturnType<typeof vi.fn<(target: Element) => void>>;
  let disconnectSpy: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    observeSpy = vi.fn();
    disconnectSpy = vi.fn();

    global.IntersectionObserver = class MockIO {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds: readonly number[] = [0];
      private cb: IntersectionObserverCallback;

      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
      }

      observe(target: Element) {
        observeSpy(target);
        // Simulate element becoming visible
        this.cb(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }

      unobserve() {}
      disconnect() { disconnectSpy(); }
      takeRecords(): IntersectionObserverEntry[] { return []; }
    } as unknown as typeof IntersectionObserver;
  });

  it('returns a ref and starts not visible until observed', () => {
    const { result } = renderHook(() => useScrollReveal());

    expect(result.current.ref).toBeDefined();
    // With our mock, it becomes visible immediately when element is observed
    // but since no DOM element is attached to the ref, observe isn't called
    expect(result.current.isVisible).toBe(false);
  });

  it('cleans up on unmount without errors', () => {
    const { unmount } = renderHook(() => useScrollReveal());
    // No DOM element attached to ref, so observer never created —
    // unmount should still complete without throwing
    expect(() => unmount()).not.toThrow();
  });

  it('accepts a custom threshold', () => {
    const { result } = renderHook(() => useScrollReveal(0.5));
    expect(result.current.ref).toBeDefined();
  });

  it('accepts a generic HTML element type', () => {
    const { result } = renderHook(() => useScrollReveal<HTMLElement>(0.2));
    expect(result.current.ref).toBeDefined();
  });
});
