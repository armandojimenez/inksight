import { describe, it, expect } from 'vitest';

describe('test infrastructure', () => {
  it('jsdom environment provides document and window', () => {
    expect(document).toBeDefined();
    expect(window).toBeDefined();
  });

  it('ResizeObserver polyfill is available', () => {
    expect(typeof ResizeObserver).toBe('function');
  });

  it('matchMedia stub is available', () => {
    expect(typeof window.matchMedia).toBe('function');
    const mql = window.matchMedia('(min-width: 1024px)');
    expect(mql).toHaveProperty('matches');
    expect(mql).toHaveProperty('addEventListener');
  });

  it('jest-dom matchers are loaded', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(div).toBeInTheDocument();
    document.body.removeChild(div);
  });
});
