import '@testing-library/jest-dom/vitest';

// Radix ScrollArea requires ResizeObserver which jsdom doesn't provide
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
