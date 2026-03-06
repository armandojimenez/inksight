import '@testing-library/jest-dom/vitest';

// Radix ScrollArea requires ResizeObserver which jsdom doesn't provide.
// Callbacks are intentionally no-op — components only need the constructor to not throw.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement IntersectionObserver — required by useScrollReveal
global.IntersectionObserver = class IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds: readonly number[] = [0];
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    // Immediately trigger as visible for tests
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
};

// jsdom doesn't implement matchMedia — required by useMediaQuery in AppLayout
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
