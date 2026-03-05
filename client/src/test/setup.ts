import '@testing-library/jest-dom/vitest';

// Radix ScrollArea requires ResizeObserver which jsdom doesn't provide.
// Callbacks are intentionally no-op — components only need the constructor to not throw.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
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
